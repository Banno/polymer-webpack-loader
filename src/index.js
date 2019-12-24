const acorn = require('acorn');
const walk = require('acorn-walk');
const htmlLoader = require('html-loader');
const escodegen = require('escodegen');
const loaderUtils = require('loader-utils');
const postcss = require('postcss');
const Tokenizer = require('css-selector-tokenizer');

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
 * @return {!Array<!Node>}
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
  return polymerTemplateExpressions;
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
 * @param {string} originalContent
 * @param {!Array<!Node>} templateNodes
 * @param {!Array<string>} templateStrings
 * @param {!Map<string, !Node>} placeholders
 * @return {string}
 */
function replacePlaceholdersWithOriginalExpressions(originalContent, templateNodes, templateStrings, placeholders) {
  let newContent = originalContent;
  for (let i = templateNodes.length - 1; i >= 0; i--) {
    const node = templateNodes[i];
    const templateString = templateStrings[i];
    const templateWithOriginalExpression = templateString.replace(
      /polymer-rename-placeholder-\d+-a/g,
      match => `\${${escodegen.generate(placeholders.get(match))}}`).trim();

    newContent = newContent.substr(0, node.quasi.range[0] + 1) +
      templateWithOriginalExpression +
      newContent.substr(node.quasi.range[1] - 1);
  }
  return newContent;
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
      if (rule.name !== 'import' && typeof rule.params !== 'string') {
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
        continue; // eslint-disable-line no-continue
      }
      const styleTagContentEndIndex = processedStyleContent.indexOf('</style', styleIndex);
      if (styleTagContentEndIndex < 0) {
        continue; // eslint-disable-line no-continue
      }
      const styleContent = processedStyleContent.substring(styleTagContentIndex, styleTagContentEndIndex);

      // No need to run through postcss unless there are url() statements
      if (styleContent.indexOf('url(') < 0) {
        continue; // eslint-disable-line no-continue
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

  const polymerTemplateExpressions = findHtmlTaggedTemplateLiterals(content);
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

  const htmlMinifiedTemplates = minifyHtmlTaggedTemplateExpressions(simpleTemplateStrings, htmlLoaderOptions);
  const styleProcessedTemplates = await updateUrlsInStyles(htmlMinifiedTemplates, this.resourcePath);

  let newContent = replacePlaceholdersWithOriginalExpressions(
    content,
    polymerTemplateExpressions,
    styleProcessedTemplates,
    subExpressionPlaceholders);

  const addTemplateCreationFunction =
    styleProcessedTemplates.find(templateExpression => templateExpression.indexOf(templateCreationFunctionName) >= 0);
  if (addTemplateCreationFunction) {
    newContent += `\nfunction ${templateCreationFunctionName}(a) {
  const template = /** @type {!HTMLTemplateElement} */(document.createElement('template'));
  template.innerText = a;
  return template;
}\n`;
  }
  callback(null, newContent);
};
