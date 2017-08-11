import url from 'url';
import { getAttribute, remove, removeFakeRootElements } from 'dom5';
import loaderUtils from 'loader-utils';
import { minify } from 'html-minifier';
import parse5 from 'parse5';
// import espree from 'espree';
// import sourceMap from 'source-map';
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["scripts"] }] */
class ProcessHtml {
  constructor(content, loader) {
    this.content = content;
    this.options = loaderUtils.getOptions(loader) || {};
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


    const links = this.links(linksArray);
    const scripts = this.scripts(scriptsArray);
    const toBody = ProcessHtml.buildRuntimeSource(toBodyArray, 'toBody');

    scriptsArray.forEach((scriptNode) => {
      remove(scriptNode);
    });
    const domModules = ProcessHtml.buildRuntimeSource(domModuleArray, 'register');
    const addRegisterImport = (toBodyArray.length > 0 || domModuleArray.length > 0) ? '\nconst RegisterHtmlTemplate = require(\'polymer-webpack-loader/register-html-template\');\n' : '';

    const source = links.source + addRegisterImport + domModules.source + toBody.source + scripts.source;
    const sourceMap = '';
    return { source, sourceMap };
  }
  /**
   * Process an array of ```<link>``` to determine if each needs to be ```require``` statement or ignored.
   * 
   * @param {Array[HtmlElements]} links
   * @return {{source: string, lineCount: number}}
   */
  links(links) {
    let source = '';
    const ignoreLinks = this.options.ignoreLinks || [];
    const ignoreLinksFromPartialMatches = this.options.ignoreLinksFromPartialMatches || [];
    const ignorePathReWrites = this.options.ignorePathReWrite || [];
    let lineCount = 0;
    links.forEach((linkNode) => {
      const href = getAttribute(linkNode, 'href') || '';
      let path = '';
      if (href) {
        const checkIgnorePaths = ignorePathReWrites.filter(ignorePath => href.indexOf(ignorePath) >= 0);
        if (checkIgnorePaths.length === 0) {
          path = ProcessHtml.checkPath(href);
        } else {
          path = href;
        }

        const ignoredFromPartial = ignoreLinksFromPartialMatches.filter(partial => href.indexOf(partial) >= 0);
        if (ignoreLinks.indexOf(href) < 0 && ignoredFromPartial.length === 0) {
          source += `\nrequire('${path}');\n`;
          lineCount += 2;
        }
      }
    });
    return {
      source,
      lineCount,
    };
  }
  /**
   * Process an array of ```<script>``` to determine if each needs to be a ```require``` statement
   * or have its contents written to the webpack module
   * 
   * @param {Array[HtmlElements]} scripts
   * @return {{source: string, lineCount: number}}
   */
  scripts(scripts) {
    // const sourceMapGenerator = null;
    let lineCount = 0;
    let source = '';
    scripts.forEach((scriptNode) => {
      const src = getAttribute(scriptNode, 'src') || '';
      if (src) {
        const path = ProcessHtml.checkPath(src);
        source += `\nrequire('${path}');\n`;
        lineCount += 2;
      } else {
        const scriptContents = parse5.serialize(scriptNode);
        /*
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
        const firstLineCharOffset = scriptNode.childNodes[0].__location.col; // eslint-disable-line no-underscore-dangle
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
        */
        source += `\n${scriptContents}\n`;
        // eslint-disable-next-line no-underscore-dangle
        lineCount += 2 + (scriptNode.__location.endTag.line - scriptNode.__location.startTag.line);
      }
    });
    return {
      source,
      lineCount,
    };
  }
  /**
   * Generates required runtime source for the HtmlElements that need to be registered
   * either in the body or as document fragments on the document.
   * @param {Array[HtmlElements]} nodes
   * @param {HtmlElement} type register or toBody
   * @return {{source: string, lineCount: number}}
   */
  static buildRuntimeSource(nodes, type) {
    let lineCount = 0;
    let source = '';
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
RegisterHtmlTemplate.${type}(${JSON.stringify(minimized)});
`;
      lineCount += 2;
    });

    return {
      source,
      lineCount,
    };
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
   * @param {HtmlElement} node
   * @param {HtmlElement} pathType src or href
   * @return {boolean}
   */
  static isExternalPath(node, pathType) {
    const path = getAttribute(node, pathType) || '';
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
   * @param {HtmlElement} node
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
