'use strict';
const parse5 = require('parse5');
const minify = require('html-minifier').minify;

class ProcessHtml {
  constructor() {
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
            path = './' + path;
          }
          console.log(path);
          this.processedImports += `\nimport './${path}';\n`;
        } else {
          this.processedJs += `\n${parse5.serialize(childNode)}\n`;
        }
        domModuleNode.childNodes.splice(index, index + 1);
      }
    });
    const minimized = minify(parse5.serialize(domModuleNode.parentNode), { collapseWhitespace: true, conservativeCollapse: true, minifyCSS: true });
    this.processedHtml += '\nRegisterImport.__webpack_register_html_import(\'' + minimized + '\');\n';
    this.processedImports += '\const RegisterImport = require(\'./register-import\');\n';    
  }

  processLink(linkNode) {
    const href = linkNode.attrs.filter((attr) => {
      return attr.name === 'href';
    });
    if (href[0].value.indexOf('polymer.html') < 0) {
      this.processedImports += `\nimport '${href[0].value}';\n`;
    }
  }

}

module.exports = (content) => {
  const parsed = parse5.parse(content);
  const processHtml = new ProcessHtml();
  processHtml.parseChildNode(parsed);
  return processHtml.processedImports + processHtml.processedHtml + processHtml.processedJs;
};