'use strict';
class RegisterHtmlTemplate {
  constructor() {}
  register(val) {
    const element = document.createElement('div');
    element.innerHTML = val;
    const node = element.content;
    document.importNode(node, true);
  }
}

module.exports = new RegisterHtmlTemplate();