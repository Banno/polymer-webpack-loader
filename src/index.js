import url from 'url';
import { getAttribute, remove, removeFakeRootElements } from 'dom5';
import { getOptions } from 'loader-utils';
import { minify } from 'html-minifier';
import { normalizeCondition } from 'webpack/lib/RuleSet';
import parse5 from 'parse5';
import espree from 'espree';
import sourceMap from 'source-map';

/** @enum {number} */
const RuntimeRegistrationType = {
  DOM_MODULE: 0,
  BODY: 1,
};

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["scripts"] }] */
class ProcessHtml {
  constructor(content, loader) {
    this.content = content;
    this.options = getOptions(loader) || {};
    this.currentFilePath = loader.resourcePath;
  }

  /**
   * Process `<link>` tags, `<dom-module>` elements, and any `<script>`'s.
   * Return transformed content as a bundle for webpack.
   */
  process() {
    const doc = parse5.parse(this.content, { locationInfo: true });
    removeFakeRootElements(doc);
    const linksArray = [];
    const domModuleArray = [];
    const scriptsArray = [];
    const toBodyArray = [];
    for (let x = 0; x < doc.childNodes.length; x++) {
      const childNode = doc.childNodes[x];
      if (childNode.tagName) {
        if (childNode.tagName === 'dom-module') {
          const domModuleChildNodes = childNode.childNodes;
          for (let y = 0; y < domModuleChildNodes.length; y++) {
            if (domModuleChildNodes[y].tagName === 'script') {
              if (!ProcessHtml.isExternalPath(domModuleChildNodes[y], 'src')) {
                scriptsArray.push(domModuleChildNodes[y]);
              }
            }
          }
          domModuleArray.push(childNode);
        } else if (childNode.tagName === 'link') {
          if (!ProcessHtml.isExternalPath(childNode, 'href') || !ProcessHtml.isCSSLink(childNode)) {
            linksArray.push(childNode);
          } else {
            toBodyArray.push(childNode);
          }
        } else if (childNode.tagName === 'script') {
          if (!ProcessHtml.isExternalPath(childNode, 'src')) {
            scriptsArray.push(childNode);
          } else {
            toBodyArray.push(childNode);
          }
        } else {
          toBodyArray.push(childNode);
        }
      }
    }
    scriptsArray.forEach((scriptNode) => {
      remove(scriptNode);
    });

    let source = this.links(linksArray);
    if (toBodyArray.length > 0 || domModuleArray.length > 0) {
      source += '\nconst RegisterHtmlTemplate = require(\'polymer-webpack-loader/register-html-template\');\n';
      source += ProcessHtml.buildRuntimeSource(toBodyArray, RuntimeRegistrationType.BODY);
      source += ProcessHtml.buildRuntimeSource(domModuleArray, RuntimeRegistrationType.DOM_MODULE);
    }
    const scriptsSource = this.scripts(scriptsArray, source.split('\n').length);
    source += scriptsSource.source;

    return {
      source,
      sourceMap: scriptsSource.sourceMap,
    };
  }

  /**
   * Process an array of ```<link>``` to determine if each needs to be ```require``` statement or ignored.
   *
   * @param {Array<HTMLElement>} links
   * @return {string}
   */
  links(links) {
    let source = '';
    // A function to test an href against options.ignoreLinks and options.ignoreLinksFromPartialMatches
    let shouldIgnore;
    let ignoreConditions = [];
    if (this.options.ignoreLinks) {
      ignoreConditions = ignoreConditions.concat(this.options.ignoreLinks);
    }
    if (this.options.ignoreLinksFromPartialMatches) {
      const partials = this.options.ignoreLinksFromPartialMatches;
      ignoreConditions = ignoreConditions.concat(resource =>
        partials.some(partial => resource.indexOf(partial) > -1));
    }

    if (ignoreConditions.length > 0) {
      shouldIgnore = normalizeCondition(ignoreConditions);
    } else {
      shouldIgnore = () => false;
    }

    // A function to test an href against options.ignorePathReWrite
    let shouldRewrite;
    if (this.options.ignorePathReWrite) {
      shouldRewrite = normalizeCondition({ not: this.options.ignorePathReWrite });
    } else {
      shouldRewrite = () => true;
    }

    links.forEach((linkNode) => {
      const href = getAttribute(linkNode, 'href');
      if (!href || shouldIgnore(href)) {
        return;
      }

      let path;
      if (shouldRewrite(href)) {
        path = ProcessHtml.checkPath(href);
      } else {
        path = href;
      }

      source += `\nrequire('${path}');\n`;
    });
    return source;
  }

  /**
   * Process an array of ```<script>``` to determine if each needs to be a ```require``` statement
   * or have its contents written to the webpack module
   *
   * @param {Array<HTMLElement>} scripts
   * @param {number} initialLineCount
   * @return {{source: string, sourceMap: (Object|undefined)}}
   */
  scripts(scripts, initialLineCount) {
    let sourceMapGenerator = null;
    let lineCount = initialLineCount;
    let source = '';
    scripts.forEach((scriptNode) => {
      const src = getAttribute(scriptNode, 'src') || '';
      if (src) {
        const path = ProcessHtml.checkPath(src);
        source += `\nrequire('${path}');\n`;
        lineCount += 2;
      } else {
        const scriptContents = parse5.serialize(scriptNode);
        sourceMapGenerator = sourceMapGenerator || new sourceMap.SourceMapGenerator();
        const tokens = espree.tokenize(scriptContents, {
          loc: true,
          ecmaVersion: 2017,
          sourceType: 'module',
        });

        // For script node content tokens, we need to offset the token position by the
        // line number of the script tag itself. And for the first line, offset the start
        // column to account for the <script> tag itself.
        const currentScriptLineOffset = scriptNode.childNodes[0].__location.line - 1; // eslint-disable-line no-underscore-dangle
        const firstLineCharOffset = scriptNode.childNodes[0].__location.col - 1; // eslint-disable-line no-underscore-dangle
        tokens.forEach((token) => {
          if (!token.loc) {
            return;
          }
          const mapping = {
            original: {
              line: token.loc.start.line + currentScriptLineOffset,
              column: token.loc.start.column + (token.loc.start.line === 1 ? firstLineCharOffset : 0),
            },
            generated: {
              line: token.loc.start.line + lineCount,
              column: token.loc.start.column,
            },
            source: this.currentFilePath,
          };

          if (token.type === 'Identifier') {
            mapping.name = token.value;
          }

          sourceMapGenerator.addMapping(mapping);
        });
        source += `\n${scriptContents}\n`;
        // eslint-disable-next-line no-underscore-dangle
        lineCount += 2 + (scriptNode.__location.endTag.line - scriptNode.__location.startTag.line);
      }
    });
    const retVal = {
      source,
    };
    if (sourceMapGenerator) {
      sourceMapGenerator.setSourceContent(this.currentFilePath, this.content);
      retVal.sourceMap = sourceMapGenerator.toJSON();
    }
    return retVal;
  }

  /**
   * Generates required runtime source for the HtmlElements that need to be registered
   * either in the body or as document fragments on the document.
   * @param {Array<HTMLElement>} nodes
   * @param {RuntimeRegistrationType} type
   * @return {string}
   */
  static buildRuntimeSource(nodes, type) {
    let source = '';
    const registrationMethod = type === RuntimeRegistrationType.BODY ? 'toBody' : 'register';
    nodes.forEach((node) => {
      // need to create an object with a childNodes array so parse5.serialize
      // will return the actual node and not just it's child nodes.
      const parseObject = {
        childNodes: [node],
      };

      const minimized = minify(parse5.serialize(parseObject), {
        collapseWhitespace: true,
        conservativeCollapse: true,
        minifyCSS: true,
        removeComments: true,
      });

      source += `
RegisterHtmlTemplate.${registrationMethod}(${JSON.stringify(minimized)});
`;
    });

    return source;
  }

  /**
   * Look to see if the HtmlElement has an external src/href as an attribute
   * e.g.
   * ```
   * <script src="http://www.example.com/main.js">
   * or
   * <link href="http://www.example.com/main.html">
   * returns: true
   * ```
   * @param {HTMLElement} node
   * @param {string} attributeName src or href
   * @return {boolean}
   */
  static isExternalPath(node, attributeName) {
    const path = getAttribute(node, attributeName) || '';
    const parseLink = url.parse(path);
    return parseLink.protocol || parseLink.slashes;
  }

  /**
   * Checks to see if the passed node is css ```<link>```
   * e.g.
   * ```
   * <link type="css" href="...">
   * or
   * <link rel="stylesheet" href="...">
   * returns: true
   * ```
   * @param {HTMLElement} node
   * @return {boolean}
   */
  static isCSSLink(node) {
    const rel = getAttribute(node, 'rel') || '';
    const type = getAttribute(node, 'type') || '';
    return rel === 'stylesheet' || type === 'css';
  }

  /**
   * Ensure that a path not starting with a relative path identifer gets ```./``` prepended
   * e.g.
   * ```
   * foo.js
   * becomes:
   * ./foo.js
   * ```
   * @param {string} path link href or script src
   * @return {boolean}
   */
  static checkPath(path) {
    const needsAdjusted = /^[A-Za-z]{1}/.test(path);
    return needsAdjusted ? `./${path}` : path;
  }
}

// eslint-disable-next-line no-unused-vars
export default function entry(content, map) {
  const results = new ProcessHtml(content, this).process();
  this.callback(null, results.source, results.sourceMap);
}
