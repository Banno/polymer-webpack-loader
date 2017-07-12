
const url = require('url');
const dom5 = require('dom5');
const loaderUtils = require('loader-utils');
const minify = require('html-minifier').minify;
const osPath = require('path');
const parse5 = require('parse5');

const pred = dom5.predicates;
const domPred = pred.AND(pred.hasTagName('dom-module'));
const linkPred = pred.AND(pred.hasTagName('link'));
const scriptsPred = pred.AND(pred.hasTagName('script'));
const espree = require('espree');
const sourceMap = require('source-map');

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
    const links = this.links();
    const doms = this.domModule();
    return this.scripts(links.source + doms.source, links.lineCount + doms.lineCount);
  }
  /**
   * Look for all `<link>` elements and turn them into `import` statements.
   * e.g. 
   * ```
   * <link rel="import" href="paper-input/paper-input.html">
   * becomes:
   * import 'paper-input/paper-input.html';
   * ```
   * @return {{source: string, lineCount: number}}
   */
  links() {
    const doc = parse5.parse(this.content, { locationInfo: true });
    dom5.removeFakeRootElements(doc);
    const links = dom5.queryAll(doc, linkPred);

    let source = '';
    const ignoreLinks = this.options.ignoreLinks || [];
    const ignoreLinksFromPartialMatches = this.options.ignoreLinksFromPartialMatches || [];
    const ignorePathReWrites = this.options.ignorePathReWrite || [];
    let lineCount = 0;
    links.forEach((linkNode) => {
      const href = dom5.getAttribute(linkNode, 'href') || '';
      let path = '';
      if (href) {
        const checkIgnorePaths = ignorePathReWrites.filter(ignorePath => href.indexOf(ignorePath) >= 0);
        if (checkIgnorePaths.length === 0) {
          path = osPath.join(osPath.dirname(this.currentFilePath), href);
        } else {
          path = href;
        }

        const ignoredFromPartial = ignoreLinksFromPartialMatches.filter(partial => href.indexOf(partial) >= 0);

        if (ignoreLinks.indexOf(href) < 0 && ignoredFromPartial.length === 0) {
          source += `\nimport '${path}';\n`;
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
   * Looks for all `<dom-module>` elements, removing any `<script>`'s without a
   * `src` and any `<link>` tags, as these are processed in separate steps.
   * @return {{source: string, lineCount: number}}
   */
  domModule() {
    const doc = parse5.parse(this.content, { locationInfo: true });
    dom5.removeFakeRootElements(doc);
    const domModule = dom5.query(doc, domPred);
    const scripts = dom5.queryAll(doc, scriptsPred);
    scripts.forEach((scriptNode) => {
      const src = dom5.getAttribute(scriptNode, 'src') || '';
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
        return {
          source: `\nconst RegisterHtmlTemplate = require('${loaderUtils.stringifyRequest(this, require.resolve('./register-html-template.js'))}');\nRegisterHtmlTemplate.register('${minimized.replace(/'/g, "\\'")}');\n`,
          lineCount: 3,
        };
      }
      return {
        source: `\nconst RegisterHtmlTemplate = + require('${loaderUtils.stringifyRequest(this, require.resolve('./register-html-template.js'))}');\nRegisterHtmlTemplate.toBody('${minimized.replace(/'/g, "\\'")}');\n`,
        lineCount: 3,
      };
    }
    return {
      source: '',
      lineCount: 0,
    };
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
   * @param {string} initialSource previously generated JS
   * @param {number} lineOffset number of lines already in initialSource
   * @return {{source: string, sourceMap: Object=}}
   */
  scripts(initialSource, lineOffset) {
    const doc = parse5.parse(this.content, { locationInfo: true });
    dom5.removeFakeRootElements(doc);
    const scripts = dom5.queryAll(doc, scriptsPred);
    let source = initialSource;
    let sourceMapGenerator = null;
    scripts.forEach((scriptNode) => {
      const src = dom5.getAttribute(scriptNode, 'src') || '';
      if (src) {
        const parseSrc = url.parse(src);
        if (!parseSrc.protocol || !parseSrc.slashes) {
          const path = osPath.join(osPath.dirname(this.currentFilePath), src);
          source += `\nimport '${path}';\n`;
          lineOffset += 2;
        }
      } else {
        const scriptContents = parse5.serialize(scriptNode);
        sourceMapGenerator = sourceMapGenerator || new sourceMap.SourceMapGenerator();
        const tokens = espree.tokenize(scriptContents, { loc: true, ecmaVersion: 2017, sourceType: 'module' });

        // For script node content tokens, we need to offset the token position by the
        // line number of the script tag itself. And for the first line, offset the start
        // column to account for the <script> tag itself.
        const currentScriptLineOffset = scriptNode.childNodes[0].__location.line - 1;
        const firstLineCharOffset = scriptNode.childNodes[0].__location.col;
        tokens.forEach((token) => {
          if (!token.loc) {
            return null;
          }
          const mapping = {
            original: {
              line: token.loc.start.line + currentScriptLineOffset,
              column: token.loc.start.column + (token.loc.start.line === 1 ? firstLineCharOffset : 0),
            },
            generated: {
              line: token.loc.start.line + lineOffset,
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
        lineOffset += 2 + (scriptNode.__location.endTag.line - scriptNode.__location.startTag.line);
      }
    });
    const retVal = {
      source,
    };
    if (sourceMapGenerator) {
      sourceMapGenerator.setSourceContent(this.currentFilePath, this.content);
      retVal.sourceMap = sourceMapGenerator.toString(); // Actually returns JSON
    }
    return retVal;
  }
}
module.exports = function (content) {
  const results = new ProcessHtml(content, this).process();
  this.callback(null, results.source, results.sourceMap);
};
