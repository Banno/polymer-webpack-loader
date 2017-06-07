'use strict';
class RegisterHtmlTemplate {
  constructor() {}
  register(val) {
    let content;
    const template = document.createElement('template');
    template.innerHTML = val;
    if (template.content) {
      content = template.content;
    } else {
      content = document.createDocumentFragment();
      while (template.firstChild) {
        content.appendChild(template.firstChild);
      }
    }
    document.importNode(content, true);
  }
}

module.exports = new RegisterHtmlTemplate();