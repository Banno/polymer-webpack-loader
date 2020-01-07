const acorn = require('acorn');
const walk = require('acorn-walk');
const htmlLoader = require('html-loader');
const escodegen = require('escodegen');
const loaderUtils = require('loader-utils');
const postcss = require('postcss');
const Tokenizer = require('css-selector-tokenizer');
const sourceMaps = require('source-map');

const parser = acorn.Parser;
const htmlLoaderDefaultOptions = {
  minimize: true,
  cacheable: false,
  minifyCSS: {
    inline: ['none'],
  },
  removeAttributeQuotes: false,
};
const polymerElementIndicatorExpr =
  /\/polymer\/polymer(-element)?\.js|(^|\s|[^\w])PolymerElement(^|\s|[^\w])|@customElement|@polymer|(^|\s|[^\w])customElements\s*\.\s*define\s*\(/;

/**
 * @param {string} value
 * @return {string}
 */
function stringCleanup(value) {
  return value.replace(/`/g, '`').replace(/(^|[^\\])\\"/g, '$1"');
}

/**
 * @param {string} content
 * @return {{ast:!Node, !templateExpressions:!Array<!Node>}}
 */
function findHtmlTaggedTemplateLiterals(content) {
  const tokens = parser.parse(content, {
    ecmaVersion: 2020,
    sourceType: 'module',
    locations: true,
    ranges: true,
  });

  let htmlTagSymbol;
  const polymerTemplateExpressions = [];
  walk.simple(tokens, {
    ImportDeclaration(node) {
      let specifiers = [];
      if (/@polymer\/polymer\/polymer-(element|legacy)\.js$/.test(node.source.value) ||
        /@polymer\/polymer\/lib\/utils\/html-tag\.js$/.test(node.source.value)) {
        specifiers = node.specifiers; // eslint-disable-line prefer-destructuring
      } else {
        return;
      }
      const htmlSpecifier = specifiers.find(
        specifier => specifier.imported.type === 'Identifier' && specifier.imported.name === 'html');
      if (htmlSpecifier) {
        htmlTagSymbol = htmlSpecifier.local.name;
      }
    },
    TaggedTemplateExpression(node) {
      if (htmlTagSymbol && node.tag.type === 'Identifier' && node.tag.name === htmlTagSymbol) {
        polymerTemplateExpressions.push(node);
      }
    },
  });
  return {
    ast: tokens,
    templateExpressions: polymerTemplateExpressions,
  };
}

/**
 * @param {!Array<!Node>} polymerTemplateExpressions
 * @return {{templates: !Array<string>, placeholders: Map<string, !Node>}}
 */
function addPlaceholdersForSubExpressions(polymerTemplateExpressions) {
  const placeholderMap = new Map();
  const polymerTemplateExpressionsWithPlaceholders = polymerTemplateExpressions.map((node) => {
    const taggedLiteralParts = [];
    for (let j = node.quasi.quasis.length - 1; j >= 0; j--) {
      const quasi = node.quasi.quasis[j];
      if (node.quasi.expressions.length > j) {
        const placeholder = `polymer-rename-placeholder-${placeholderMap.size + 1}-a`;
        placeholderMap.set(
          placeholder,
          node.quasi.expressions[j],
        );
        taggedLiteralParts.unshift(placeholder);
      }
      taggedLiteralParts.unshift(quasi.value.raw.replace(/`/g, '\\`'));
    }
    return taggedLiteralParts.join('');
  });

  return {
    templates: polymerTemplateExpressionsWithPlaceholders,
    placeholders: placeholderMap,
  };
}

const templateCreationFunctionName = '__createTemplateFromString';

/**
 * @param {!Node} stringExpression
 * @return {string}
 */
function convertStringConcatenationToTemplateLiteral(stringExpression) {
  let newContent;
  if (stringExpression.type === 'Literal') {
    newContent = stringExpression.value;
  } else if (stringExpression.type === 'BinaryExpression') {
    let expression = stringExpression;
    const expressionParts = [];
    while (expression) {
      if (expression.right.type === 'Literal') {
        expressionParts.unshift(stringCleanup(expression.right.value));
      } else {
        expressionParts.unshift(`\${${templateCreationFunctionName}(${escodegen.generate(expression.right)})}`);
      }
      if (expression.left.type === 'BinaryExpression') {
        expression = expression.left;
      } else if (expression.left.type === 'Literal') {
        expressionParts.unshift(stringCleanup(expression.left.value));
        expression = null;
      } else {
        expressionParts.unshift(`\${${templateCreationFunctionName}(${escodegen.generate(expression.left)})}`);
        expression = null;
      }
    }
    newContent = expressionParts.join('');
  } else {
    throw new Error(`Unrecognized expression from HTML Loader: ${stringExpression.type}`);
  }
  return newContent;
}

/**
 * @param {!Array<string>} templateStrings
 * @param {Object} htmlLoaderOptions
 * @return {!Array<string>}
 */
function minifyHtmlTaggedTemplateExpressions(templateStrings, htmlLoaderOptions) {
  const minifiedTemplateLiterals = templateStrings.map((tagValue) => {
    let minifiedSource = htmlLoader.call({
      options: {
        htmlLoader: htmlLoaderOptions,
      },
    }, tagValue);
    if (minifiedSource) {
      const stringExpression = parser.parse(minifiedSource, {
        ecmaVersion: 2020,
        sourceType: 'module',
        locations: true,
        ranges: true,
      }).body[0].expression.right;
      minifiedSource = convertStringConcatenationToTemplateLiteral(stringExpression);
    }
    return minifiedSource;
  });
  return minifiedTemplateLiterals;
}

/**
 * @param {string} content
 * @param {!Node} ast
 * @return {!SourceMap}
 */
function createIdentitySourceMap(content, ast, filePath) {
  const sourceMapGenerator = new sourceMaps.SourceMapGenerator();
  const addedTokens = new Set();
  const addToken = (token) => {
    if (!token.loc || addedTokens.has(token)) {
      return;
    }
    const mapping = {
      original: {
        line: token.loc.start.line,
        column: token.loc.start.column,
      },
      generated: {
        line: token.loc.start.line,
        column: token.loc.start.column,
      },
      source: filePath,
    };
    if (token.type === 'Identifier' && token.name && !addedTokens.has(token)) {
      addedTokens.add(token);
      mapping.name = token.name;
    }
    sourceMapGenerator.addMapping(mapping);
    if (token.type !== 'Identifier') {
      Object.keys(token).forEach((tokenKey) => {
        if (token[tokenKey] &&
            token[tokenKey].type === 'Identifier' &&
            token[tokenKey].name &&
            !addedTokens.has(token[tokenKey])) {
          addToken(token[tokenKey]);
        }
      });
    }
  };
  walk.full(ast, (token) => {
    addToken(token);
  });
  sourceMapGenerator.setSourceContent(filePath, content);
  return sourceMapGenerator.toJSON();
}

/**
 * @param {sourceMaps.SourceMapGenerator} sourceMapGenerator
 * @param {!Array} mappings
 * @param {number} startIndex
 * @param {{line: number, column: number}} untilLoc
 * @param {{line: number, column: number, columnLine: number}} offsets
 * @return {number}
 */
function addMappingsUntil(sourceMapGenerator, mappings, startIndex, untilLoc, offsets) {
  let i;
  for (i = startIndex;
    i < mappings.length &&
      (mappings[i].generatedLine < untilLoc.line ||
        (mappings[i].generatedLine === untilLoc.line && mappings[i].generatedColumn < untilLoc.column));
    i++) {
    const mapping = {
      source: mappings[i].source,
      generated: {
        line: mappings[i].generatedLine + offsets.line,
        column: (mappings[i].generatedLine === offsets.columnLine ? offsets.column : 0) + mappings[i].generatedColumn,
      },
    };
    if (mappings[i].originalLine !== undefined) {
      mapping.original = {
        line: mappings[i].originalLine,
        column: mappings[i].originalColumn,
      };
    }
    if (mappings[i].name) {
      mapping.name = mappings[i].name;
    }
    sourceMapGenerator.addMapping(mapping);
  }
  return i;
}

/**
 * @param {string} originalContent
 * @param {!Array<!Node>} templateNodes
 * @param {!Array<string>} templateStrings
 * @param {!Map<string, !Node>} placeholders
 * @param {SourceMap=} sourceMap
 * @return {!Promise<string>}
 */
async function replacePlaceholdersWithOriginalExpressions(originalContent, templateNodes, templateStrings, placeholders, sourceMap) {
  let sourceMapConsumer;
  let sourceMapGenerator;
  const sourceMappings = [];
  if (sourceMap) {
    sourceMapConsumer = await new sourceMaps.SourceMapConsumer(sourceMap);
    sourceMapGenerator = new sourceMaps.SourceMapGenerator();
    sourceMapConsumer.eachMapping((mapping) => {
      sourceMappings.push(mapping);
      if (sourceMapConsumer.sourceContentFor(mapping.source, true)) {
        sourceMapGenerator.setSourceContent(mapping.source, sourceMapConsumer.sourceContentFor(mapping.source));
      }
    });
  }
  const originalContentLines = originalContent.split('\n');
  const newContentLines = [''];

  let originalLineColumnIndex = 0;
  let originalLine = 1;
  let sourceMappingsCurrentIndex = 0;

  function addNewContentLines(value) {
    const lines = value.split('\n');
    if (lines.length > 0) {
      newContentLines[newContentLines.length - 1] += lines[0];
    }
    if (lines.length > 1) {
      newContentLines.push(...lines.slice(1));
    }
  }

  for (let i = 0; i < templateNodes.length; i++) {
    const node = templateNodes[i];
    if (sourceMap) {
      const currentMapping = sourceMappings[sourceMappingsCurrentIndex];
      let generatedColumnOffset = 0;
      if (currentMapping && currentMapping.generatedLine === originalLine) {
        generatedColumnOffset = newContentLines[newContentLines.length - 1].length - currentMapping.generatedColumn;
      }
      sourceMappingsCurrentIndex = addMappingsUntil(
        sourceMapGenerator,
        sourceMappings,
        sourceMappingsCurrentIndex,
        node.loc.start,
        {
          line: newContentLines.length - originalLine,
          column: generatedColumnOffset,
          columnLine: originalLine,
        });
    }
    newContentLines[newContentLines.length - 1] += originalContentLines[originalLine - 1].substr(originalLineColumnIndex);
    newContentLines.push(...originalContentLines.slice(originalLine, node.loc.start.line));
    const currentLine = newContentLines.pop().substr(0, node.quasi.loc.start.column);
    newContentLines.push(currentLine);
    originalLine = node.quasi.loc.start.line;

    const templateString = templateStrings[i].trim();
    const placeholderExpression = /polymer-rename-placeholder-\d+-a/;
    let match;
    let templateStringWorkingContents = `\`${templateString}\``;
    // eslint-disable-next-line no-cond-assign
    while ((match = placeholderExpression.exec(templateStringWorkingContents)) !== null) {
      const originalExpression = placeholders.get(match[0]);
      addNewContentLines(`${templateStringWorkingContents.substr(0, match.index)}\${`);
      const expressionLineStartLoc = {
        line: newContentLines.length,
        column: newContentLines[newContentLines.length - 1].length,
      };
      addNewContentLines(`${originalContent.substring(originalExpression.range[0], originalExpression.range[1])}}`);
      templateStringWorkingContents = templateStringWorkingContents.substr(match.index + match[0].length);
      if (sourceMap) {
        sourceMappingsCurrentIndex = sourceMappings.findIndex(mapping =>
          mapping.generatedLine === originalExpression.loc.start.line &&
            mapping.generatedColumn === originalExpression.loc.start.column);
        sourceMappingsCurrentIndex = addMappingsUntil(
          sourceMapGenerator,
          sourceMappings,
          sourceMappingsCurrentIndex,
          {
            line: originalExpression.loc.end.line,
            column: originalExpression.loc.end.column,
          },
          {
            line: expressionLineStartLoc.line - originalExpression.loc.start.line,
            column: expressionLineStartLoc.column - originalExpression.loc.start.column,
            columnLine: originalExpression.loc.start.line,
          });
        const nextMapping = sourceMappings[sourceMappingsCurrentIndex];
        originalLine = nextMapping.originalLine; // eslint-disable-line prefer-destructuring
      }
    }
    addNewContentLines(templateStringWorkingContents);
    originalLine = node.quasi.loc.end.line;
    originalLineColumnIndex = node.quasi.loc.end.column;
    if (sourceMap) {
      sourceMappingsCurrentIndex = sourceMappings.findIndex(mapping =>
        mapping.generatedLine > node.quasi.loc.end.line ||
        (mapping.generatedLine === node.quasi.loc.end.line && mapping.generatedColumn > node.quasi.end.generatedColumn));
    }
  }

  if (sourceMap && sourceMappingsCurrentIndex < sourceMappings.length) {
    const currentMapping = sourceMappings[sourceMappingsCurrentIndex];
    let generatedColumnOffset = 0;
    if (currentMapping && currentMapping.generatedLine === originalLine) {
      generatedColumnOffset = newContentLines[newContentLines.length - 1].length - currentMapping.generatedColumn;
    }
    addMappingsUntil(
      sourceMapGenerator,
      sourceMappings,
      sourceMappingsCurrentIndex,
      {
        line: Infinity,
        column: Infinity,
      },
      {
        line: newContentLines.length - originalLine,
        column: generatedColumnOffset,
        columnLine: originalLine,
      });
    sourceMapConsumer.destroy();
  }
  newContentLines[newContentLines.length - 1] += originalContentLines[originalLine - 1].substr(originalLineColumnIndex);
  newContentLines.push(...originalContentLines.slice(originalLine));
  return {
    source: newContentLines.join('\n'),
    sourceMap: sourceMap ? sourceMapGenerator.toJSON() : undefined,
  };
}

const STYLE_URL_PREFIX = '__POLYMER_WEBPACK_LOADER_URL_';
const STYLE_URL_EXPR = new RegExp(`${STYLE_URL_PREFIX}\\d+__`, 'g');
const STYLE_URL_IMPORT_EXPR = new RegExp(`@import url\\((${STYLE_URL_PREFIX}\\d+__)\\);`, 'g');

/**
 * Ensure that a path not starting with ```/```, ```./```, ```~``` or ```../``` gets ```./``` prepended.
 * e.g.
 * ```
 * foo.js
 * becomes:
 * ./foo.js
 * ```
 * @param {string} urlPath link href or script src
 * @return {string} adjusted path
 */
function adjustPathIfNeeded(urlPath) {
  if (/^~/.test(urlPath)) {
    return urlPath.substr(1);
  } else if (/^\.{0,2}\//.test(urlPath)) {
    return urlPath;
  }
  return `./${urlPath}`;
}

/**
 * postcss parser plugin to update url()s
 * Url records are added to the parserOptions argument which
 * is passed in.
 *
 * @param {Object} cssOptions
 */
function postcssPlugin(parserOptions) {
  return (css) => {
    function processNode(node) {
      const item = node;
      switch (item.type) {
        case 'value':
          item.nodes.forEach(processNode);
          break;

        case 'nested-item':
          item.nodes.forEach(processNode);
          break;

        case 'url':
          if (item.url.replace(/\s/g, '').length && !/^#/.test(item.url) &&
              loaderUtils.isUrlRequest(item.url, parserOptions.root)) {
            // Don't remove quotes around url when contain space
            if (item.url.indexOf(' ') === -1) {
              item.stringType = '';
            }
            delete item.innerSpacingBefore;
            delete item.innerSpacingAfter;
            const itemUrl = item.url;
            const urlId = `${STYLE_URL_PREFIX}${parserOptions.getNextIndex()}__`;
            parserOptions.urlMap.set(urlId, adjustPathIfNeeded(itemUrl));
            item.url = urlId;
          }
          break;

        default:
          break;
      }
    }

    css.walkDecls((decl) => {
      const localDecl = decl;
      const values = Tokenizer.parseValues(decl.value);
      values.nodes.forEach((value) => {
        value.nodes.forEach(processNode);
      });
      localDecl.value = Tokenizer.stringifyValues(values);
    });

    css.walkAtRules((rule) => {
      if (rule.name !== 'import' || typeof rule.params !== 'string') {
        return;
      }
      const localRule = rule;
      const values = Tokenizer.parseValues(rule.params);
      values.nodes.forEach((value) => {
        value.nodes.forEach(processNode);
      });
      localRule.params = Tokenizer.stringifyValues(values);
    });
  };
}

const postcssParserPlugin = postcss.plugin('polymer-webpack-loader-parser', postcssPlugin);

/**
 * @param {!Array<string>} templateStrings
 * @param {string} currentFilePath
 * @return {!Promise<!Array<string>>}
 */
async function updateUrlsInStyles(templateStrings, currentFilePath) {
  const stylePlaceholders = new Map();
  const replacedTemplates = [];
  let currentStyleId = 0;
  function getNextIndex() {
    const nextId = currentStyleId;
    currentStyleId += 1;
    return nextId;
  }

  for (let i = 0; i < templateStrings.length; i++) {
    let processedStyleContent = templateStrings[i];
    for (let styleIndex = processedStyleContent.indexOf('<style');
      styleIndex >= 0;
      styleIndex = processedStyleContent.indexOf('<style', styleIndex + '<style'.length)) {
      const styleTagContentIndex = processedStyleContent.indexOf('>', styleIndex) + 1;
      if (styleTagContentIndex <= 0) {
        continue;
      }
      const styleTagContentEndIndex = processedStyleContent.indexOf('</style', styleIndex);
      if (styleTagContentEndIndex < 0) {
        continue;
      }
      const styleContent = processedStyleContent.substring(styleTagContentIndex, styleTagContentEndIndex);

      // No need to run through postcss unless there are url() statements
      if (styleContent.indexOf('url(') < 0) {
        continue;
      }

      currentStyleId += 1;
      const parserCssOptions = {
        root: styleContent,
        urlMap: stylePlaceholders,
        getNextIndex,
      };
      const postcssPipeline = postcss([postcssParserPlugin(parserCssOptions)]);
      const options = {
        // we need a prefix to avoid path rewriting of PostCSS
        from: `/polymer-webpack-loader!${currentFilePath}`,
        to: currentFilePath,
        map: null,
      };
      // eslint-disable-next-line no-await-in-loop
      let processedStyle = (await postcssPipeline.process(styleContent, options)).css;
      processedStyle = processedStyle.replace(STYLE_URL_IMPORT_EXPR, (match, g1) => {
        if (!stylePlaceholders.has(g1)) {
          return match;
        }
        const rewrittenUrl = stylePlaceholders.get(g1);
        return `@import url('\${${templateCreationFunctionName}(require(${JSON.stringify(rewrittenUrl)}))}');`;
      });
      processedStyle = processedStyle.replace(STYLE_URL_EXPR, (match) => {
        if (!stylePlaceholders.has(match)) {
          return match;
        }
        let rewrittenUrl = stylePlaceholders.get(match);
        let queryIndex = rewrittenUrl.indexOf('?#');
        if (queryIndex < 0) {
          queryIndex = rewrittenUrl.indexOf('#');
        }
        let urlSuffix = '';
        // queryIndex === 0 is caught by isUrlRequest
        if (queryIndex > 0) {
          // in cases like url('webfont.eot?#iefix')
          urlSuffix = rewrittenUrl.substr(queryIndex);
          rewrittenUrl = rewrittenUrl.substr(0, queryIndex);
        }
        return `'\${${templateCreationFunctionName}(require(${JSON.stringify(rewrittenUrl)}))}${urlSuffix}'`;
      });

      processedStyleContent = processedStyleContent.substr(0, styleTagContentIndex) +
          processedStyle +
          processedStyleContent.substr(styleTagContentEndIndex);
    }
    replacedTemplates.push(processedStyleContent);
  }
  return replacedTemplates;
}

module.exports = async function entry(content, sourceMap) {
  const callback = this.async();
  // See if the contents contain any indicator that this might be a Polymer Element. If not, avoid parsing.
  if (!polymerElementIndicatorExpr.test(content)) {
    callback(null, content, sourceMap);
    return;
  }

  const { ast, templateExpressions: polymerTemplateExpressions } = findHtmlTaggedTemplateLiterals(content);
  if (!sourceMap && this.sourceMap) {
    sourceMap = createIdentitySourceMap(content, ast, this.resourcePath); // eslint-disable-line no-param-reassign
  }
  const { placeholders: subExpressionPlaceholders, templates: simpleTemplateStrings } =
      addPlaceholdersForSubExpressions(polymerTemplateExpressions);
  const options = loaderUtils.getOptions(this) || {};
  const htmlLoaderOptions = Object.assign({}, htmlLoaderDefaultOptions, options.htmlLoader || {});
  if (htmlLoaderOptions.exportAsDefault) {
    delete htmlLoaderOptions.exportAsDefault;
  }
  if (htmlLoaderOptions.exportAsEs6Default) {
    delete htmlLoaderOptions.exportAsEs6Default;
  }

  const escapedTemplateStrings = simpleTemplateStrings.map(templateString => templateString.replace(/`/g, '\\`'));
  const htmlMinifiedTemplates = minifyHtmlTaggedTemplateExpressions(escapedTemplateStrings, htmlLoaderOptions);
  const styleProcessedTemplates = await updateUrlsInStyles(htmlMinifiedTemplates, this.resourcePath);

  // eslint-disable-next-line prefer-const
  let { source: newContent, sourceMap: newSourceMap } = await replacePlaceholdersWithOriginalExpressions(
    content,
    polymerTemplateExpressions,
    styleProcessedTemplates,
    subExpressionPlaceholders,
    this.sourceMap ? sourceMap : undefined);

  const addTemplateCreationFunction =
    styleProcessedTemplates.find(templateExpression => templateExpression.indexOf(templateCreationFunctionName) >= 0);
  if (addTemplateCreationFunction) {
    newContent += `\nfunction ${templateCreationFunctionName}(a) {
  const template = /** @type {!HTMLTemplateElement} */(document.createElement('template'));
  template.content.appendChild(document.createTextNode(a));
  return template;
}\n`;
  }
  callback(null, newContent, newSourceMap);
};
