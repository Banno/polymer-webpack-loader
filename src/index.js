const acorn = require('acorn');
const walk = require('acorn-walk');
const htmlLoader = require('html-loader');
const escodegen = require('escodegen');
const loaderUtils = require('loader-utils');

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

function stringCleanup(value) {
  return value.replace(/`/g, '`').replace(/(^|[^\\])\\"/g, '$1"');
}

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
    // minifiedSource = minifiedSource.replace(
    //   /polymer-rename-placeholder-\d+-a/g,
    //   match => `\${${escodegen.generate(placeholderMap.get(match))}}`).trim();
    //
    // newContent = newContent.substr(0, node.quasi.range[0] + 1) +
    //   minifiedSource + newContent.substr(node.quasi.range[1] - 1);
  });
  return minifiedTemplateLiterals;
}

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

// eslint-disable-next-line no-unused-vars
module.exports = function entry(content, sourceMap) {
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

  // TODO add CSS processing

  let newContent = replacePlaceholdersWithOriginalExpressions(
    content,
    polymerTemplateExpressions,
    htmlMinifiedTemplates,
    subExpressionPlaceholders);

  if (htmlMinifiedTemplates.find(templateExpression => templateExpression.indexOf(templateCreationFunctionName) >= 0)) {
    newContent += `\nfunction __createTemplateFromString(a) {
  const template = /** @type {!HTMLTemplateElement} */(document.createElement('template'));
  template.innerHTML = a;
  return template;
}\n`;
  }
  callback(null, newContent);
};
