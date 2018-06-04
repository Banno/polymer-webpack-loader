import url from 'url';
import path from 'path';
import {
  append,
  constructors,
  getAttribute,
  getTextContent,
  insertBefore,
  predicates,
  query,
  queryAll,
  remove,
  removeFakeRootElements,
  setTextContent,
} from 'dom5';
import loaderUtils from 'loader-utils';
import { normalizeCondition } from 'webpack/lib/RuleSet';
import parse5 from 'parse5';
import espree from 'espree';
import sourceMap from 'source-map';
import htmlLoader from 'html-loader';
import Tokenizer from 'css-selector-tokenizer';
import postcss from 'postcss';

/** @enum {number} */
const RuntimeRegistrationType = {
  DOM_MODULE: 0,
  BODY: 1,
};

const htmlLoaderDefaultOptions = {
  minimize: true,
  cacheable: false,
  minifyCSS: {
    inline: ['none'],
  },
};

const STYLE_ID_PREFIX = '__POLYMER_WEBPACK_LOADER_STYLE_';
const STYLE_ID_EXPR = new RegExp(`/\\* (${STYLE_ID_PREFIX}\\d+__) \\*/`, 'g');
const STYLE_URL_PREFIX = '__POLYMER_WEBPACK_LOADER_URL_';
const STYLE_URL_EXPR = new RegExp(`${STYLE_URL_PREFIX}\\d+__`, 'g');
const STYLE_URL_IMPORT_EXPR = new RegExp(`<style>@import url\\((${STYLE_URL_PREFIX}\\d+__)\\);</style>`, 'g');

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["scripts"] }] */
class ProcessHtml {
  constructor(content, loader) {
    this.content = content;
    this.options = loaderUtils.getOptions(loader) || {};
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
  process() {
    const doc = parse5.parse(this.content, { locationInfo: true });
    removeFakeRootElements(doc);

    // Gather up all the element types to process
    const linksArray = [];
    const domModuleArray = [];
    const scriptsArray = [];
    const toBodyArray = [];
    const externalStyleSheetsArray = [];
    doc.childNodes.forEach((rootNode) => {
      switch (rootNode.tagName) {
        case 'dom-module':
          rootNode.childNodes.forEach((domModuleChild) => {
            if (domModuleChild.tagName === 'script') {
              if (!ProcessHtml.isExternalPath(domModuleChild, 'src')) {
                scriptsArray.push(domModuleChild);
              }
            } else if (domModuleChild.tagName === 'link' && this.options.processStyleLinks) {
              const href = getAttribute(domModuleChild, 'href') || '';
              const rel = getAttribute(domModuleChild, 'rel') || '';
              const type = getAttribute(domModuleChild, 'type') || '';
              if (href && (rel === 'stylesheet' || type === 'css') && !ProcessHtml.isExternalPath(domModuleChild, 'href')) {
                externalStyleSheetsArray.push(domModuleChild);
              }
            } else if (domModuleChild.tagName === 'template' && this.options.processStyleLinks) {
              domModuleChild.content.childNodes.forEach((templateChild) => {
                if (templateChild.tagName) {
                  if (templateChild.tagName === 'link') {
                    const href = getAttribute(templateChild, 'href') || '';
                    const rel = getAttribute(templateChild, 'rel') || '';
                    const type = getAttribute(templateChild, 'type') || '';
                    if (href && (rel === 'stylesheet' || type === 'css') && !ProcessHtml.isExternalPath(templateChild, 'href')) {
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
          if (ProcessHtml.isExternalPath(rootNode, 'href') || getAttribute(rootNode, 'rel') !== 'import') {
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
    scriptsArray.forEach((scriptNode) => {
      remove(scriptNode);
    });

    // Find all the <style> tags to pass through postcss
    const styleElements = ProcessHtml.inlineExternalStylesheets(externalStyleSheetsArray)
      .concat(queryAll(doc, predicates.hasTagName('style')));
    const templateElements = queryAll(doc, predicates.hasTagName('template'));
    templateElements.forEach((templateElement) => {
      styleElements.push(...queryAll(templateElement.content, predicates.hasTagName('style')));
    });

    // Postcss is asyncronous, so we have to wait for it to complete
    const stylesProcessed = this.styles(styleElements);

    let source = this.links(linksArray);
    if (toBodyArray.length > 0 || domModuleArray.length > 0) {
      source += '\nconst RegisterHtmlTemplate = require(\'polymer-webpack-loader/register-html-template\');\n';
    }

    // After styles are processed, replace the special comments with the rewritten
    // style contents
    return stylesProcessed.then(() => {
      // Put the contents of the style tag processed by postcss back in the element
      styleElements.forEach((style) => {
        const originalTextContent = getTextContent(style);
        if (originalTextContent.indexOf(STYLE_ID_PREFIX) >= 0) {
          const replacedTextContent = originalTextContent.replace(STYLE_ID_EXPR, (match, g1) => {
            if (!this.stylePlaceholders.has(g1)) {
              return match;
            }
            return this.stylePlaceholders.get(g1);
          });
          setTextContent(style, replacedTextContent);
        }
      });

      // External stylesheet import URLS were replaced with placeholders
      // Replace the entire import with a  ```require``` calls
      const replaceImportUrls = (match, g1) => {
        if (!this.stylePlaceholders.has(g1)) {
          return match;
        }
        const rewrittenUrl = this.stylePlaceholders.get(g1);
        return `<style>" + require(${JSON.stringify(rewrittenUrl)}) + "</style>`;
      };

      // Style URLS were replaced with placeholders
      // Replace the placeholders with ```require``` calls
      const replaceStyleUrls = (match) => {
        if (!this.stylePlaceholders.has(match)) {
          return match;
        }
        let rewrittenUrl = this.stylePlaceholders.get(match);
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
        return `'" + require(${JSON.stringify(rewrittenUrl)}) + "${urlSuffix}'`;
      };

      const htmlLoaderOptions = Object.assign({}, htmlLoaderDefaultOptions, this.options.htmlLoader || {});
      if (htmlLoaderOptions.exportAsDefault) {
        delete htmlLoaderOptions.exportAsDefault;
      }
      if (htmlLoaderOptions.exportAsEs6Default) {
        delete htmlLoaderOptions.exportAsEs6Default;
      }

      const toBodyContent = toBodyArray.map(node =>
        ProcessHtml.htmlLoader(node, htmlLoaderOptions)
          .replace(STYLE_URL_IMPORT_EXPR, replaceImportUrls)
          .replace(STYLE_URL_EXPR, replaceStyleUrls));

      const assetPath = `${path.relative(path.resolve(this.options.componentsDirectory || './src'), path.dirname(this.currentFilePath)).replace(new RegExp(`\\${path.sep}`, 'g'), '/')}/`;
      const assetPathAttribute = assetPath.length > 1 ? ` assetpath=${assetPath} ` : '';
      const domModuleContent = domModuleArray.map(node =>
        ProcessHtml.htmlLoader(node, htmlLoaderOptions)
          .replace(STYLE_URL_IMPORT_EXPR, replaceImportUrls)
          .replace(STYLE_URL_EXPR, replaceStyleUrls)
          .replace('<dom-module', `<dom-module${assetPathAttribute}`));

      source += ProcessHtml.buildRuntimeSource(toBodyContent, RuntimeRegistrationType.BODY);
      source += ProcessHtml.buildRuntimeSource(domModuleContent, RuntimeRegistrationType.DOM_MODULE);
      const scriptsSource = this.scripts(scriptsArray, source.split('\n').length);
      source += scriptsSource.source;

      return {
        source,
        sourceMap: scriptsSource.sourceMap,
      };
    });
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
        path = ProcessHtml.adjustPathIfNeeded(href);
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
        const path = ProcessHtml.adjustPathIfNeeded(src);
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
  styles(styles) {
    const processStylePromises = [];
    styles.forEach((styleElement) => {
      const styleContent = getTextContent(styleElement);

      // No need to run through postcss unless there are url() statements
      if (styleContent.indexOf('url(') < 0) {
        return;
      }

      const id = `${STYLE_ID_PREFIX}${this.currentStyleId_}__`;
      this.currentStyleId_ += 1;
      const parserCssOptions = {
        root: styleContent,
        urlMap: this.stylePlaceholders,
        getNextIndex: () => {
          const nextId = this.currentStyleId_;
          this.currentStyleId_ += 1;
          return nextId;
        },
      };
      const postcssPipeline = postcss([ProcessHtml.postcssParserPlugin(parserCssOptions)]);
      const options = {
        // we need a prefix to avoid path rewriting of PostCSS
        from: `/polymer-webpack-loader!${this.currentFilePath}`,
        to: this.currentFilePath,
        map: null,
      };
      processStylePromises.push(postcssPipeline.process(styleContent, options)
        .then((result) => {
          this.stylePlaceholders.set(id, result.css);
        }));

      // replace all the style content with a unique id we can look it up later
      setTextContent(styleElement, `/* ${id} */`);
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
  static inlineExternalStylesheets(externalStyleSheets) {
    const newStyleElements = [];
    externalStyleSheets.forEach((linkElement) => {
      const newStyleElement = constructors.element('style');
      setTextContent(newStyleElement, `@import url(${JSON.stringify(getAttribute(linkElement, 'href'))});`);
      let domModule = linkElement;
      for (; domModule && domModule.tagName !== 'dom-module'; domModule = domModule.parentNode);

      if (domModule) {
        const template = query(domModule, predicates.hasTagName('template'));
        if (!template) {
          return;
        }
        if (template.content.childNodes.length > 0) {
          insertBefore(template.content, template.content.childNodes[0], newStyleElement);
        } else {
          append(template.content, newStyleElement);
        }
      } else {
        insertBefore(linkElement.parentNode, linkElement, newStyleElement);
      }
      remove(linkElement);
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
  static buildRuntimeSource(content, type) {
    const registrationMethod = type === RuntimeRegistrationType.BODY ? 'toBody' : 'register';
    return content.map(source => `\nRegisterHtmlTemplate.${registrationMethod}(${source});\n`)
      .join('');
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
    const parseLink = url.parse(path, false, true);
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
  static htmlLoader(node, options) {
    // need to create an object with a childNodes array so parse5.serialize
    // will return the actual node and not just it's child nodes.
    const parseObject = {
      childNodes: [node],
    };

    // Run the html-loader for all HTML content so that images are
    // added to the dependency graph
    const serializedSource = parse5.serialize(parseObject);
    let minifiedSource = htmlLoader.call({
      options: {
        htmlLoader: options,
      },
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
  static postcssPlugin(parserOptions) {
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
            if (item.url.replace(/\s/g, '').length && !/^#/.test(item.url) && loaderUtils.isUrlRequest(item.url, parserOptions.root)) {
              // Don't remove quotes around url when contain space
              if (item.url.indexOf(' ') === -1) {
                item.stringType = '';
              }
              delete item.innerSpacingBefore;
              delete item.innerSpacingAfter;
              const itemUrl = item.url;
              const urlId = `${STYLE_URL_PREFIX}${parserOptions.getNextIndex()}__`;
              parserOptions.urlMap.set(urlId, ProcessHtml.adjustPathIfNeeded(itemUrl));
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
  static adjustPathIfNeeded(path) {
    if (/^~/.test(path)) {
      return path.substr(1);
    } else if (/^\.{0,2}\//.test(path)) {
      return path;
    }
    return `./${path}`;
  }
}

ProcessHtml.postcssParserPlugin = postcss.plugin('polymer-webpack-loader-parser', ProcessHtml.postcssPlugin);

// eslint-disable-next-line no-unused-vars
export default function entry(content, map) {
  const callback = this.async();
  const processedHtml = new ProcessHtml(content, this).process();
  processedHtml
    .then((results) => {
      callback(null, results.source, results.sourceMap);
    })
    .catch(callback);
}

