'use strict';
class RegisterImport {
  constructor() {}
  __webpack_register_html_import(val) {
    const template = document.createElement('template');
    template.innerHTML = val;
    const node = template.content;
    document.importNode(node, true);
  }
}

module.exports = new RegisterImport();