'use strict';
const parse5 = require('parse5');
const loaderUtils = require('loader-utils');
const minify = require('html-minifier').minify;

class ProcessHtml {
  constructor(loader) {
    this.loader = loader;
    this.options = loaderUtils.getOptions(loader) || {};
    this.processedJs = '';
    this.processedImports = '';
    this.processedHtml = '';
  }
  parseChildNode(node) {
    const parsed = node.childNodes || [];
    parsed.map((childNode) => {
      if (childNode.tagName === 'dom-module') {
        this.parseDomModuleNode(childNode);
      } else if (childNode.tagName === 'link') {
        this.processLink(childNode);
      } else if (childNode.tagName === 'script') {
        this.processedJs += `\n${parse5.serialize(childNode)}\n`;
      } else {
        this.parseChildNode(childNode);
      }
    });
  }

  parseDomModuleNode(domModuleNode) {
    const childNodes = domModuleNode.childNodes;
    childNodes.map((childNode, index) => {
      if (childNode.tagName === 'script') {
        const src = childNode.attrs.filter((attr) => {
          return attr.name === 'src';
        });
        if (src[0]) {
          let path = src[0].value;
          if (path.indexOf('./') < 0) {
            path = loaderUtils.urlToRequest(src[0].value);
          }
          this.processedImports += `\nimport '${path}';\n`;
        } else {
          this.processedJs += `\n${parse5.serialize(childNode)}\n`;
        }
        domModuleNode.childNodes.splice(index, index + 1);
      }
    });
    const minimized = minify(parse5.serialize(domModuleNode.parentNode), { collapseWhitespace: true, conservativeCollapse: true, minifyCSS: true });
    this.processedHtml += '\nRegisterImport.register(\'' + minimized.replace(/'/g, "\\'") + '\');\n';
    this.processedImports += '\nconst RegisterImport = require(\'./register-import\');\n';    
  }

  processLink(linkNode) {
    const href = linkNode.attrs.filter((attr) => {
      return attr.name === 'href';
    });
    const ignoreLinks = this.options.ignoreLinks || [];
    const modules = this.options.modules || [];
    let path = href[0].value || '';
    const checkModules = modules.filter((module) => {
      return path.indexOf(module) >= 0;
    });
    if (checkModules.length === 0) {
      if (path.indexOf('./') < 0) {
        path = loaderUtils.urlToRequest(href[0].value);
      } else {
        path = loaderUtils.urlToRequest(loaderUtils.urlToRequest(href[0].value, '~'));
      }
    }
    if (ignoreLinks.indexOf(path) < 0) {
      this.processedImports += `\nimport '${path}';\n`;
    }
  }
}

module.exports = function(content) {
  const parsed = parse5.parse(content);
  const processHtml = new ProcessHtml(this);
  processHtml.parseChildNode(parsed);
  return processHtml.processedImports + processHtml.processedHtml + processHtml.processedJs;
};
