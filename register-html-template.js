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
  toBody(val) {
    val = val.trim();
    if (val) {
      const div = document.createElement('div');
      div.innerHTML = val;
      if (div.firstChild) {
        document.addEventListener('DOMContentLoaded', (event) => {
          document.body.insertBefore(div.firstChild, document.body.firstChild);
        });
      }
    }
  }
}

module.exports = new RegisterHtmlTemplate();