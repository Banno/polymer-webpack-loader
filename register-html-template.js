'use strict';
class RegisterHtmlTemplate {
  constructor() {}
  register(val) {
    const template = document.createElement('template');
    template.innerHTML = val;
    const node = template.content;
    document.importNode(node, true);
  }
}

module.exports = new RegisterHtmlTemplate();