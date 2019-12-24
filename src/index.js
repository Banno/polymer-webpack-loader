import { Parser as parser } from 'acorn';
import { simple as walk } from 'acorn-walk';
import htmlLoader from 'html-loader';
import escodegen from 'escodegen';
import loaderUtils from 'loader-utils';

const htmlLoaderDefaultOptions = {
  minimize: true,
  cacheable: false,
  minifyCSS: {
    inline: ['none'],
  },
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
  walk(tokens, {
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

function processTaggedTemplateExpressions(content, polymerTemplateExpressions, htmlLoaderOptions) {
  let newContent = content;
  let addTemplateCreationFunction = false;
  for (let i = polymerTemplateExpressions.length - 1; i >= 0; i--) {
    const node = polymerTemplateExpressions[i];
    const placeholderMap = new Map();
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
    const tagValue = taggedLiteralParts.join('');

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

      if (stringExpression.type === 'Literal') {
        minifiedSource = stringExpression.value;
      } else if (stringExpression.type === 'BinaryExpression') {
        let expression = stringExpression;
        const expressionParts = [];
        while (expression) {
          if (expression.right.type === 'Literal') {
            expressionParts.unshift(
              stringCleanup(
                expression.right.raw.substr(
                  0,
                  expression.right.raw.length + (expressionParts.length === 0 ? -1 : 0))));
          } else {
            addTemplateCreationFunction = true;
            expressionParts.unshift(`\${__createTemplateFromString(${escodegen.generate(expression.right)})}`);
          }
          if (expression.left.type === 'BinaryExpression') {
            expression = expression.left;
          } else if (expression.left.type === 'Literal') {
            expressionParts.unshift(
              stringCleanup(expression.left.raw.substr(1)));
            expression = null;
          } else {
            addTemplateCreationFunction = true;
            expressionParts.unshift(`\${__createTemplateFromString(${escodegen.generate(expression.left)})}`);
            expression = null;
          }
        }
        minifiedSource = expressionParts.join('');
      } else {
        throw new Error(`Unrecognized expression from HTML Loader: ${stringExpression.type}`);
      }
    }
    minifiedSource = minifiedSource.replace(
      /polymer-rename-placeholder-\d+-a/g,
      match => `\${${escodegen.generate(placeholderMap.get(match))}}`).trim();

    newContent = newContent.substr(0, node.quasi.range[0] + 1) +
      minifiedSource + newContent.substr(node.quasi.range[1] - 1);
  }
  if (addTemplateCreationFunction) {
    newContent += `\nfunction __createTemplateFromString(a) {
  const template = /** @type {!HTMLTemplateElement} */(document.createElement('template'));
  template.innerHTML = a;
  return template;
}\n`;
  }
  return newContent;
}

// eslint-disable-next-line no-unused-vars
export default function entry(content, sourceMap) {
  // See if the contents contain any indicator that this might be a Polymer Element. If not, avoid parsing.
  if (!polymerElementIndicatorExpr.test(content)) {
    return content;
  }

  const polymerTemplateExpressions = findHtmlTaggedTemplateLiterals(content);
  const options = loaderUtils.getOptions(this) || {};
  const htmlLoaderOptions = Object.assign({}, htmlLoaderDefaultOptions, options.htmlLoader || {});
  if (htmlLoaderOptions.exportAsDefault) {
    delete htmlLoaderOptions.exportAsDefault;
  }
  if (htmlLoaderOptions.exportAsEs6Default) {
    delete htmlLoaderOptions.exportAsEs6Default;
  }

  return processTaggedTemplateExpressions(content, polymerTemplateExpressions, htmlLoaderOptions);
}
