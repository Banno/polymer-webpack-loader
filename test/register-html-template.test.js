/* eslint-env browser */

import RegisterHtmlTemplate from '../register-html-template';

describe('RegisterHtmlTemplate', () => {
  describe('register', () => {
    // doesn't pass until we can spy on importNode
    // or define a custom element to track registrations in jsdom
    test.skip('imports node', () => {
      jest.spyOn(document, 'importNode');

      RegisterHtmlTemplate.register('<dom-module id="x-foo"></dom-module>');
      expect(document.importNode.calls[0][0].innerHTML)
        .toBe('<dom-module id="x-foo"></dom-module>');
    });
  });

  describe('toBody', () => {
    test('ignores empty values', () => {
      RegisterHtmlTemplate.toBody('    ');
      expect(document.body.innerHTML).toBe('');
    });

    test('ignores invalid html', () => {
      RegisterHtmlTemplate.toBody('</span>');
      expect(document.body.innerHTML).toBe('');
    });

    test('prepends elements', () => {
      RegisterHtmlTemplate.toBody('<div id="test"></div>');
      expect(document.body.innerHTML).toBe('<div id="test"></div>');
    });
  });
});
