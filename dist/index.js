"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = entry;

var _url = _interopRequireDefault(require("url"));

var _dom = require("dom5");

var _loaderUtils = _interopRequireDefault(require("loader-utils"));

var _parse = _interopRequireDefault(require("parse5"));

var _espree = _interopRequireDefault(require("espree"));

var _sourceMap = _interopRequireDefault(require("source-map"));

var _htmlLoader2 = _interopRequireDefault(require("html-loader"));

var _cssSelectorTokenizer = _interopRequireDefault(require("css-selector-tokenizer"));

var _postcss = _interopRequireDefault(require("postcss"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _iterableToArray(iter) { if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) return _arrayLikeToArray(arr); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }

/** @enum {number} */
var RuntimeRegistrationType = {
  DOM_MODULE: 0,
  BODY: 1
};
var htmlLoaderDefaultOptions = {
  minimize: true,
  cacheable: false,
  minifyCSS: {
    inline: ['none']
  }
};
var STYLE_ID_PREFIX = '__POLYMER_WEBPACK_LOADER_STYLE_';
var STYLE_ID_EXPR = new RegExp(`/\\* (${STYLE_ID_PREFIX}\\d+__) \\*/`, 'g');
var STYLE_URL_PREFIX = '__POLYMER_WEBPACK_LOADER_URL_';
var STYLE_URL_EXPR = new RegExp(`${STYLE_URL_PREFIX}\\d+__`, 'g');
var STYLE_URL_IMPORT_EXPR = new RegExp(`<style>@import url\\((${STYLE_URL_PREFIX}\\d+__)\\);</style>`, 'g');
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["scripts"] }] */

var ProcessHtml = /*#__PURE__*/function () {
  function ProcessHtml(content, loader) {
    _classCallCheck(this, ProcessHtml);

    this.content = content;
    this.options = _loaderUtils.default.getOptions(loader) || {};
    this.currentFilePath = loader.resourcePath;
    this.loader = loader;
    this.currentStyleId_ = 0;
    this.stylePlaceholders = new Map();
  }
  /**
   * Process `<link>` tags, `<dom-module>` elements, and any `<script>`'s.
   * @return {Promise<{source: string, sourceMap: (string|undefined)}>} transform
   *   content as a bundle for webpack.
   */


  _createClass(ProcessHtml, [{
    key: "process",
    value: function process() {
      var _this = this;

      var doc = _parse.default.parse(this.content, {
        locationInfo: true
      });

      (0, _dom.removeFakeRootElements)(doc); // Gather up all the element types to process

      var linksArray = [];
      var domModuleArray = [];
      var scriptsArray = [];
      var toBodyArray = [];
      var externalStyleSheetsArray = [];
      doc.childNodes.forEach(function (rootNode) {
        switch (rootNode.tagName) {
          case 'dom-module':
            rootNode.childNodes.forEach(function (domModuleChild) {
              if (domModuleChild.tagName === 'script') {
                if (!ProcessHtml.isExternalPath(domModuleChild, 'src')) {
                  scriptsArray.push(domModuleChild);
                }
              } else if (domModuleChild.tagName === 'link' && _this.options.processStyleLinks) {
                var href = (0, _dom.getAttribute)(domModuleChild, 'href') || '';
                var rel = (0, _dom.getAttribute)(domModuleChild, 'rel') || '';
                var type = (0, _dom.getAttribute)(domModuleChild, 'type') || '';

                if (href && (rel === 'stylesheet' || type === 'css') && !ProcessHtml.isExternalPath(domModuleChild, 'href')) {
                  externalStyleSheetsArray.push(domModuleChild);
                }
              } else if (domModuleChild.tagName === 'template' && _this.options.processStyleLinks) {
                domModuleChild.content.childNodes.forEach(function (templateChild) {
                  if (templateChild.tagName) {
                    if (templateChild.tagName === 'link') {
                      var _href = (0, _dom.getAttribute)(templateChild, 'href') || '';

                      var _rel = (0, _dom.getAttribute)(templateChild, 'rel') || '';

                      var _type = (0, _dom.getAttribute)(templateChild, 'type') || '';

                      if (_href && (_rel === 'stylesheet' || _type === 'css') && !ProcessHtml.isExternalPath(templateChild, 'href')) {
                        externalStyleSheetsArray.push(templateChild);
                      }
                    }
                  }
                });
              }
            });
            domModuleArray.push(rootNode);
            break;

          case 'link':
            if (ProcessHtml.isExternalPath(rootNode, 'href') || (0, _dom.getAttribute)(rootNode, 'rel') !== 'import') {
              toBodyArray.push(rootNode);
            } else {
              linksArray.push(rootNode);
            }

            break;

          case 'script':
            if (!ProcessHtml.isExternalPath(rootNode, 'src')) {
              scriptsArray.push(rootNode);
            } else {
              toBodyArray.push(rootNode);
            }

            break;

          default:
            if (rootNode.tagName) {
              toBodyArray.push(rootNode);
            }

            break;
        }
      });
      scriptsArray.forEach(function (scriptNode) {
        (0, _dom.remove)(scriptNode);
      }); // Find all the <style> tags to pass through postcss

      var styleElements = ProcessHtml.inlineExternalStylesheets(externalStyleSheetsArray).concat((0, _dom.queryAll)(doc, _dom.predicates.hasTagName('style')));
      var templateElements = (0, _dom.queryAll)(doc, _dom.predicates.hasTagName('template'));
      templateElements.forEach(function (templateElement) {
        styleElements.push.apply(styleElements, _toConsumableArray((0, _dom.queryAll)(templateElement.content, _dom.predicates.hasTagName('style'))));
      }); // Postcss is asyncronous, so we have to wait for it to complete

      var stylesProcessed = this.styles(styleElements);
      var source = this.links(linksArray);

      if (toBodyArray.length > 0 || domModuleArray.length > 0) {
        source += '\nconst RegisterHtmlTemplate = require(\'polymer-webpack-loader/register-html-template\');\n';
      } // After styles are processed, replace the special comments with the rewritten
      // style contents


      return stylesProcessed.then(function () {
        // Put the contents of the style tag processed by postcss back in the element
        styleElements.forEach(function (style) {
          var originalTextContent = (0, _dom.getTextContent)(style);

          if (originalTextContent.indexOf(STYLE_ID_PREFIX) >= 0) {
            var replacedTextContent = originalTextContent.replace(STYLE_ID_EXPR, function (match, g1) {
              if (!_this.stylePlaceholders.has(g1)) {
                return match;
              }

              return _this.stylePlaceholders.get(g1);
            });
            (0, _dom.setTextContent)(style, replacedTextContent);
          }
        }); // External stylesheet import URLS were replaced with placeholders
        // Replace the entire import with a  ```require``` calls

        var replaceImportUrls = function replaceImportUrls(match, g1) {
          if (!_this.stylePlaceholders.has(g1)) {
            return match;
          }

          var rewrittenUrl = _this.stylePlaceholders.get(g1);

          return `<style>" + require(${JSON.stringify(rewrittenUrl)}) + "</style>`;
        }; // Style URLS were replaced with placeholders
        // Replace the placeholders with ```require``` calls


        var replaceStyleUrls = function replaceStyleUrls(match) {
          if (!_this.stylePlaceholders.has(match)) {
            return match;
          }

          var rewrittenUrl = _this.stylePlaceholders.get(match);

          var queryIndex = rewrittenUrl.indexOf('?#');

          if (queryIndex < 0) {
            queryIndex = rewrittenUrl.indexOf('#');
          }

          var urlSuffix = ''; // queryIndex === 0 is caught by isUrlRequest

          if (queryIndex > 0) {
            // in cases like url('webfont.eot?#iefix')
            urlSuffix = rewrittenUrl.substr(queryIndex);
            rewrittenUrl = rewrittenUrl.substr(0, queryIndex);
          }

          return `'" + require(${JSON.stringify(rewrittenUrl)}) + "${urlSuffix}'`;
        };

        var htmlLoaderOptions = Object.assign({}, htmlLoaderDefaultOptions, _this.options.htmlLoader || {});

        if (htmlLoaderOptions.exportAsDefault) {
          delete htmlLoaderOptions.exportAsDefault;
        }

        if (htmlLoaderOptions.exportAsEs6Default) {
          delete htmlLoaderOptions.exportAsEs6Default;
        }

        var toBodyContent = toBodyArray.map(function (node) {
          return ProcessHtml.htmlLoader(node, htmlLoaderOptions).replace(STYLE_URL_IMPORT_EXPR, replaceImportUrls).replace(STYLE_URL_EXPR, replaceStyleUrls);
        });
        var domModuleContent = domModuleArray.map(function (node) {
          return ProcessHtml.htmlLoader(node, htmlLoaderOptions).replace(STYLE_URL_IMPORT_EXPR, replaceImportUrls).replace(STYLE_URL_EXPR, replaceStyleUrls);
        });
        source += ProcessHtml.buildRuntimeSource(toBodyContent, RuntimeRegistrationType.BODY);
        source += ProcessHtml.buildRuntimeSource(domModuleContent, RuntimeRegistrationType.DOM_MODULE);

        var scriptsSource = _this.scripts(scriptsArray, source.split('\n').length);

        source += scriptsSource.source;
        return {
          source,
          sourceMap: scriptsSource.sourceMap
        };
      });
    }
    /**
     * Process an array of ```<link>``` to determine if each needs to be ```require``` statement or ignored.
     *
     * @param {Array<HTMLElement>} links
     * @return {string}
     */

  }, {
    key: "links",
    value: function links(_links) {
      var source = '';

      _links.forEach(function (linkNode) {
        var href = (0, _dom.getAttribute)(linkNode, 'href');

        if (!href) {
          return;
        }

        var path = ProcessHtml.adjustPathIfNeeded(href);
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

  }, {
    key: "scripts",
    value: function scripts(_scripts, initialLineCount) {
      var _this2 = this;

      var sourceMapGenerator = null;
      var lineCount = initialLineCount;
      var source = '';

      _scripts.forEach(function (scriptNode) {
        var src = (0, _dom.getAttribute)(scriptNode, 'src') || '';

        if (src) {
          var path = ProcessHtml.adjustPathIfNeeded(src);
          source += `\nrequire('${path}');\n`;
          lineCount += 2;
        } else {
          var scriptContents = _parse.default.serialize(scriptNode);

          sourceMapGenerator = sourceMapGenerator || new _sourceMap.default.SourceMapGenerator();

          var tokens = _espree.default.tokenize(scriptContents, {
            loc: true,
            ecmaVersion: 2017,
            sourceType: 'module'
          }); // For script node content tokens, we need to offset the token position by the
          // line number of the script tag itself. And for the first line, offset the start
          // column to account for the <script> tag itself.


          var currentScriptLineOffset = scriptNode.childNodes[0].__location.line - 1; // eslint-disable-line no-underscore-dangle

          var firstLineCharOffset = scriptNode.childNodes[0].__location.col - 1; // eslint-disable-line no-underscore-dangle

          tokens.forEach(function (token) {
            if (!token.loc) {
              return;
            }

            var mapping = {
              original: {
                line: token.loc.start.line + currentScriptLineOffset,
                column: token.loc.start.column + (token.loc.start.line === 1 ? firstLineCharOffset : 0)
              },
              generated: {
                line: token.loc.start.line + lineCount,
                column: token.loc.start.column
              },
              source: _this2.currentFilePath
            };

            if (token.type === 'Identifier') {
              mapping.name = token.value;
            }

            sourceMapGenerator.addMapping(mapping);
          });
          source += `\n${scriptContents}\n`; // eslint-disable-next-line no-underscore-dangle

          lineCount += 2 + (scriptNode.__location.endTag.line - scriptNode.__location.startTag.line);
        }
      });

      var retVal = {
        source
      };

      if (sourceMapGenerator) {
        sourceMapGenerator.setSourceContent(this.currentFilePath, this.content);
        retVal.sourceMap = sourceMapGenerator.toJSON();
      }

      return retVal;
    }
    /**
     * Process an array of ```<style>``` elements
     * If the content contains a ```url()``` statement, it is initially replaced
     * with a unique identifier used to match back the postcss processed content.
     *
     * A custom postcss parser plugin replaces all url hrefs with a different
     * unique placeholder. These placeholders are replaced after all processing and
     * minification with ```require``` statements
     *
     * @param {Array<HTMLElement>} styles
     * @return {Promise<Map<string, string>>} map of style identifiers to content
     */

  }, {
    key: "styles",
    value: function styles(_styles) {
      var _this3 = this;

      var processStylePromises = [];

      _styles.forEach(function (styleElement) {
        var styleContent = (0, _dom.getTextContent)(styleElement); // No need to run through postcss unless there are url() statements

        if (styleContent.indexOf('url(') < 0) {
          return;
        }

        var id = `${STYLE_ID_PREFIX}${_this3.currentStyleId_}__`;
        _this3.currentStyleId_ += 1;
        var parserCssOptions = {
          root: styleContent,
          urlMap: _this3.stylePlaceholders,
          getNextIndex: function getNextIndex() {
            var nextId = _this3.currentStyleId_;
            _this3.currentStyleId_ += 1;
            return nextId;
          }
        };
        var postcssPipeline = (0, _postcss.default)([ProcessHtml.postcssParserPlugin(parserCssOptions)]);
        var options = {
          // we need a prefix to avoid path rewriting of PostCSS
          from: `/polymer-webpack-loader!${_this3.currentFilePath}`,
          to: _this3.currentFilePath,
          map: null
        };
        processStylePromises.push(postcssPipeline.process(styleContent, options).then(function (result) {
          _this3.stylePlaceholders.set(id, result.css);
        })); // replace all the style content with a unique id we can look it up later

        (0, _dom.setTextContent)(styleElement, `/* ${id} */`);
      });

      return Promise.all(processStylePromises);
    }
    /**
     * Process an array of ```<link rel="stylesheet">``` elements
     * These elements will be replaced with ```<style>``` tags
     * with ```@import url(href)```.
     *
     * The existing style processing will update the url to a placeholder
     * which will be replaced with a ```require``` call.
     *
     * @param {Array<HTMLElement>} externalStyleSheets
     * @return {Array<HTMLElement>} list of new style elements
     */

  }], [{
    key: "inlineExternalStylesheets",
    value: function inlineExternalStylesheets(externalStyleSheets) {
      var newStyleElements = [];
      externalStyleSheets.forEach(function (linkElement) {
        var newStyleElement = _dom.constructors.element('style');

        (0, _dom.setTextContent)(newStyleElement, `@import url(${JSON.stringify((0, _dom.getAttribute)(linkElement, 'href'))});`);
        var domModule = linkElement;

        for (; domModule && domModule.tagName !== 'dom-module'; domModule = domModule.parentNode) {
          ;
        }

        if (domModule) {
          var template = (0, _dom.query)(domModule, _dom.predicates.hasTagName('template'));

          if (!template) {
            return;
          }

          if (template.content.childNodes.length > 0) {
            (0, _dom.insertBefore)(template.content, template.content.childNodes[0], newStyleElement);
          } else {
            (0, _dom.append)(template.content, newStyleElement);
          }
        } else {
          (0, _dom.insertBefore)(linkElement.parentNode, linkElement, newStyleElement);
        }

        (0, _dom.remove)(linkElement);
        newStyleElements.push(newStyleElement);
      });
      return newStyleElements;
    }
    /**
     * Generates required runtime source for the HtmlElements that need to be registered
     * either in the body or as document fragments on the document.
     * @param {Array<string>} content
     * @param {RuntimeRegistrationType} type
     * @return {string}
     */

  }, {
    key: "buildRuntimeSource",
    value: function buildRuntimeSource(content, type) {
      var registrationMethod = type === RuntimeRegistrationType.BODY ? 'toBody' : 'register';
      return content.map(function (source) {
        return `\nRegisterHtmlTemplate.${registrationMethod}(${source});\n`;
      }).join('');
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

  }, {
    key: "isExternalPath",
    value: function isExternalPath(node, attributeName) {
      var path = (0, _dom.getAttribute)(node, attributeName) || '';

      var parseLink = _url.default.parse(path, false, true);

      return parseLink.protocol || parseLink.slashes;
    }
    /**
     * Given an HTML Element, run the serialized content through the html-loader
     * to add require statements for images.
     *
     * @param {HTMLElement} content
     * @param {Object} options
     * @return {string}
     */

  }, {
    key: "htmlLoader",
    value: function htmlLoader(node, options) {
      // need to create an object with a childNodes array so parse5.serialize
      // will return the actual node and not just it's child nodes.
      var parseObject = {
        childNodes: [node]
      }; // Run the html-loader for all HTML content so that images are
      // added to the dependency graph

      var serializedSource = _parse.default.serialize(parseObject);

      var minifiedSource = _htmlLoader2.default.call({
        options: {
          htmlLoader: options
        }
      }, serializedSource);

      if (minifiedSource) {
        minifiedSource = minifiedSource.substr('module.exports = '.length);
        minifiedSource = minifiedSource.replace(/;\s*$/, '');
      }

      return minifiedSource;
    }
    /**
     * postcss parser plugin to update url()s
     * Url records are added to the parserOptions argument which
     * is passed in.
     *
     * @param {Object} cssOptions
     */

  }, {
    key: "postcssPlugin",
    value: function postcssPlugin(parserOptions) {
      return function (css) {
        function processNode(node) {
          var item = node;

          switch (item.type) {
            case 'value':
              item.nodes.forEach(processNode);
              break;

            case 'nested-item':
              item.nodes.forEach(processNode);
              break;

            case 'url':
              if (item.url.replace(/\s/g, '').length && !/^#/.test(item.url) && _loaderUtils.default.isUrlRequest(item.url, parserOptions.root)) {
                // Don't remove quotes around url when contain space
                if (item.url.indexOf(' ') === -1) {
                  item.stringType = '';
                }

                delete item.innerSpacingBefore;
                delete item.innerSpacingAfter;
                var itemUrl = item.url;
                var urlId = `${STYLE_URL_PREFIX}${parserOptions.getNextIndex()}__`;
                parserOptions.urlMap.set(urlId, ProcessHtml.adjustPathIfNeeded(itemUrl));
                item.url = urlId;
              }

              break;

            default:
              break;
          }
        }

        css.walkDecls(function (decl) {
          var localDecl = decl;

          var values = _cssSelectorTokenizer.default.parseValues(decl.value);

          values.nodes.forEach(function (value) {
            value.nodes.forEach(processNode);
          });
          localDecl.value = _cssSelectorTokenizer.default.stringifyValues(values);
        });
        css.walkAtRules(function (rule) {
          if (rule.name !== 'import' && typeof rule.params !== 'string') {
            return;
          }

          var localRule = rule;

          var values = _cssSelectorTokenizer.default.parseValues(rule.params);

          values.nodes.forEach(function (value) {
            value.nodes.forEach(processNode);
          });
          localRule.params = _cssSelectorTokenizer.default.stringifyValues(values);
        });
      };
    }
    /**
     * Ensure that a path not starting with ```/```, ```./```, ```~``` or ```../``` gets ```./``` prepended.
     * e.g.
     * ```
     * foo.js
     * becomes:
     * ./foo.js
     * ```
     * @param {string} path link href or script src
     * @return {string} adjusted path
     */

  }, {
    key: "adjustPathIfNeeded",
    value: function adjustPathIfNeeded(path) {
      if (/^~/.test(path)) {
        return path.substr(1);
      } else if (/^\.{0,2}\//.test(path)) {
        return path;
      }

      return `./${path}`;
    }
  }]);

  return ProcessHtml;
}();

ProcessHtml.postcssParserPlugin = _postcss.default.plugin('polymer-webpack-loader-parser', ProcessHtml.postcssPlugin); // eslint-disable-next-line no-unused-vars

function entry(content, map) {
  var callback = this.async();
  var processedHtml = new ProcessHtml(content, this).process();
  processedHtml.then(function (results) {
    callback(null, results.source, results.sourceMap);
  }).catch(callback);
}