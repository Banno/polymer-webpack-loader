'use strict';
const dom5 = require('dom5');
const loaderUtils = require('loader-utils');
const minify = require('html-minifier').minify;
const osPath = require('path');
const parse5 = require('parse5');
const url = require('url');

const pred = dom5.predicates;
const domPred = pred.AND(pred.hasTagName('dom-module'));
const linkPred = pred.AND(pred.hasTagName('link'));
const scriptsPred = pred.AND(pred.hasTagName('script'));

class ProcessHtml {
  constructor(content, loader) {
    this.content = content;
    this.options = loaderUtils.getOptions(loader) || {};
    this.currentFilePath = loader.resourcePath;
  }
  /**
   * Looks for all `<dom-module>` elements, removing any `<script>`'s without a
   * `src` and any `<link>` tags, as these are processed in separate steps.
   */
  domModule() {
    let doc = parse5.parse(this.content, { locationInfo: true });
    dom5.removeFakeRootElements(doc);
    const domModule = dom5.query(doc, domPred);
    const scripts = dom5.queryAll(doc, scriptsPred);
    scripts.forEach((scriptNode) => {
      let src = dom5.getAttribute(scriptNode, 'src') || '';
      if (src) {
        const parseSrc = url.parse(src);
        if (!parseSrc.protocol || !parseSrc.slashes) {
          dom5.remove(scriptNode);
        }
      } else {
        dom5.remove(scriptNode);
      }
    });
    const links = dom5.queryAll(doc, linkPred);
    links.forEach((linkNode) => {
      dom5.remove(linkNode);
    });
    const html = domModule ? domModule.parentNode : doc;
    const minimized = minify(parse5.serialize(html), { collapseWhitespace: true, conservativeCollapse: true, minifyCSS: true, removeComments: true });
    if (minimized) {
      if (domModule) {
        return '\nconst RegisterHtmlTemplate = require(\'polymer-webpack-loader/register-html-template\');\nRegisterHtmlTemplate.register(\'' + minimized.replace(/'/g, "\\'") + '\');\n';
      } else {
        return '\nconst RegisterHtmlTemplate = require(\'polymer-webpack-loader/register-html-template\');\nRegisterHtmlTemplate.toBody(\'' + minimized.replace(/'/g, "\\'") + '\');\n';
      }
    }
    return '';
  }
  /**
   * Look for all `<link>` elements and turn them into `import` statements.
   * e.g. 
   * ```
   * <link rel="import" href="paper-input/paper-input.html">
   * becomes:
   * import 'paper-input/paper-input.html';
   * ```
   */
  links() {
    const doc = parse5.parse(this.content, { locationInfo: true });
    dom5.removeFakeRootElements(doc);
    const links = dom5.queryAll(doc, linkPred);

    let returnValue = '';
    const ignoreLinks = this.options.ignoreLinks || [];
    const ignoreLinksFromPartialMatches = this.options.ignoreLinksFromPartialMatches || [];
    const ignorePathReWrites = this.options.ignorePathReWrite || [];
    links.forEach((linkNode) => {
      let href = dom5.getAttribute(linkNode, 'href') || '';
      let path = '';
      if (href) {
        const checkIgnorePaths = ignorePathReWrites.filter((ignorePath) => {
          return href.indexOf(ignorePath) >= 0;
        });
        if (checkIgnorePaths.length === 0) {
          path = osPath.join(osPath.dirname(this.currentFilePath), href);
        } else {
          path = href;
        }

        const ignoredFromPartial = ignoreLinksFromPartialMatches.filter(partial => {
            return href.indexOf(partial) >= 0;
        });

        if (ignoreLinks.indexOf(href) < 0 && ignoredFromPartial.length === 0) {
          returnValue += `\nimport '${path}';\n`;
        }


      }
    });
    return returnValue;
  }
  /**
   * Process `<link>` tags, `<dom-module>` elements, and any `<script>`'s.
   * Return transformed content as a bundle for webpack.
   */
  process() {
    const links = this.links();
    const doms = this.domModule();
    const scripts = this.scripts();
    return links + doms + scripts;
  }
  /**
   * Look for all `<script>` elements. If the script has a valid `src` attribute
   * it will be converted to an `import` statement.
   * e.g.
   * ```
   * <script src="foo.js">
   * becomes:
   * import 'foo';
   * ```
   * Otherwise if it's an inline script block, the content will be serialized
   * and returned as part of the bundle.
   */
  scripts() {
    const doc = parse5.parse(this.content, { locationInfo: true });
    dom5.removeFakeRootElements(doc);
    const scripts = dom5.queryAll(doc, scriptsPred);
    let returnValue = '';
    scripts.forEach((scriptNode) => {
      let src = dom5.getAttribute(scriptNode, 'src') || '';
      if (src) {
        const parseSrc = url.parse(src);
        if (!parseSrc.protocol || !parseSrc.slashes) {
          const path = osPath.join(osPath.dirname(this.currentFilePath), src);
          returnValue += `\nimport '${path}';\n`;
        }
      } else {
        returnValue += `\n${parse5.serialize(scriptNode)}\n`;
      }
    });
    return returnValue;
  }
}
module.exports = function(content) {
  return new ProcessHtml(content, this).process();
};
