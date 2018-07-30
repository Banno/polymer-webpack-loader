/* eslint-env browser */

class RegisterHtmlTemplate {
  /**
   * Create a `<template>` element to hold `<dom-module>` content.
   * This bit of code will execute in the context of the main document,
   * calling `importNode` on the `<template>`, which in turn triggers
   * the lifecycle of the `<dom-module>` and allows it to insert its
   * content into Polymer's global module map. When a Polymer element
   * boots up it will fetch its template from this module map.
   * https://github.com/Polymer/polymer/blob/master/lib/mixins/element-mixin.html#L501-L538
   * @param {string} val A `<dom-module>` as an HTML string
   */
  static register(val) {
    let content;
    const template = document.createElement('template');
    template.innerHTML = val;
    if (template.content) {
      content = template.content; // eslint-disable-line prefer-destructuring
    } else {
      content = document.createDocumentFragment();
      while (template.firstChild) {
        content.appendChild(template.firstChild);
      }
    }
    document.importNode(content, true);
  }
  /**
   * Content that will be injected into the main document. This is primarily
   * for things like `<iron-iconset>` and `<custom-style>` which do not have
   * templates but rely on HTML Imports ability to apply content to the main
   * document.
   * @param {string} val An HTML string
   */
  static toBody(val) {
    const trimmedVal = val.trim();
    if (trimmedVal) {
      const div = document.createElement('div');
      div.innerHTML = trimmedVal;
      if (div.firstChild) {
        if (document.body) {
          document.body.appendChild(div.firstChild);
        } else {
          document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(div.firstChild);
          });
        }
      }
    }
  }
}

module.exports = RegisterHtmlTemplate;
