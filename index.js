'use strict';
const parse5 = require('parse5');
const loaderUtils = require('loader-utils');
const minify = require('html-minifier').minify;
const parse5Utils = require('parse5-utils');

class ProcessHtml {
  constructor(content, loader) {
    this.content = content;
    this.options = loaderUtils.getOptions(loader) || {};    
  }

  process() {
    const links = this.links();
    const doms = this.processDomModule();
    const scripts = this.scripts();
    return links + doms + scripts;
  }
  links() {
    const parsed = parse5.parse(this.content);
    let flatten = parse5Utils.flatten(parsed);
    let links = flatten.filter((node) => {
      return node.tagName === 'link';
    });
    let returnValue = '';
    const ignoreLinks = this.options.ignoreLinks || [];
    const ignorePathReWrites = this.options.ignorePathReWrite || [];
    links.forEach((linkNode) => {
      let path = parse5Utils.getAttribute(linkNode, 'href') || '';
      if (path) {
        const checkIgnorePaths = ignorePathReWrites.filter((ignorePath) => {
          return path.indexOf(ignorePath) >= 0;
        });
        if (checkIgnorePaths.length === 0) {
          if (path.indexOf('./') < 0) {
            path = loaderUtils.urlToRequest(path);
          } else {
            path = loaderUtils.urlToRequest(loaderUtils.urlToRequest(path, '~'));
          }
        }
        if (ignoreLinks.indexOf(path) < 0) {
          returnValue += `\nimport '${path}';\n`;
        }
      }
    });
    return returnValue;
  }
  scripts() {
    const parsed = parse5.parse(this.content);
    let flatten = parse5Utils.flatten(parsed);
    let scripts = flatten.filter((node) => {
      return node.tagName === 'script';
    });
    let returnValue = '';
    scripts.forEach((scriptNode) => {
      let src = parse5Utils.getAttribute(scriptNode, 'src') || '';
      if (src) {
        if (src.indexOf('./') < 0) {
          src = loaderUtils.urlToRequest(src);
        }
        returnValue += `\nimport '${src}';\n`;
      } else {
        returnValue += `\n${parse5.serialize(scriptNode)}\n`;
      }
    });
    return returnValue;
  }
  processDomModule() {    
    let fragmentNode = parse5Utils.parse(this.content, true);
    if (fragmentNode.childNodes) {
      fragmentNode.childNodes = fragmentNode.childNodes.filter((node) => {
        return node.tagName === 'dom-module';
      });
      if (fragmentNode.childNodes[0]) {
        fragmentNode.childNodes[0].childNodes = fragmentNode.childNodes[0].childNodes.filter((node) => {
          return node.tagName !== 'script';
        });
      }
      const minimized = minify(parse5.serialize(fragmentNode), { collapseWhitespace: true, conservativeCollapse: true, minifyCSS: true });
      if (minimized) {
        return '\nconst RegisterHtmlTemplate = require(\'./register-html-template\');\nRegisterHtmlTemplate.register(\'' + minimized.replace(/'/g, "\\'") + '\');\n';   
      }
    }
    return '';
  }
}

module.exports = function(content) {
  return new ProcessHtml(content, this).process();
};