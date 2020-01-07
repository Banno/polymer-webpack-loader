/* eslint no-undefined: "off", no-useless-escape: "off" */

const sourceMap = require('source-map');
const loader = require('../src');

const normalisePaths = result => result.replace('src\\\\', 'src/');

async function verifySourceMap(generatedSource, map) {
  const consumer = await new sourceMap.SourceMapConsumer(map);
  consumer.eachMapping((mapping) => {
    if (!mapping.name) {
      return;
    }
    const originalSourceByLine = consumer.sourceContentFor(mapping.source).split('\n');
    const generatedSourceByLine = generatedSource.split('\n');

    expect(generatedSourceByLine[mapping.generatedLine - 1].substr(mapping.generatedColumn, mapping.name.length))
      .toBe(mapping.name);
    expect(originalSourceByLine[mapping.originalLine - 1].substr(mapping.originalColumn, mapping.name.length))
      .toBe(mapping.name);
  });
  consumer.destroy();
}

function addTemplateToPolymerElement(templateValue) {
  return `import {PolymerElement, html} from "@polymer/polymer/polymer-element.js";

class FooElement extends PolymerElement {
  static get is() { return "foo-element"; }
  static get template() { return html\`${templateValue}\`; }
}
customElements.define(FooElement.is, FooElement);
`;
}

describe('loader', () => {
  let opts;

  beforeEach(() => {
    opts = {
      resourcePath: 'src/test.js',
      query: {
        htmlLoader: {
          minimize: false,
          exportAsDefault: true,
          exportAsEs6Default: true,
        },
      },
      sourceMap: false,
    };
  });

  test('can process basic input', (done) => {
    opts.async = () => (err, source, map) => {
      expect(err).toBe(null);
      expect(normalisePaths(source)).toMatchSnapshot();
      expect(map).toBe(undefined);
      done();
    };
    loader.call(opts, 'class Foo {}');
  });

  test('can process without options', (done) => {
    opts.query = null;
    opts.async = () => (err, source, map) => {
      expect(err).toBe(null);
      expect(normalisePaths(source)).toMatchSnapshot();
      expect(map).toBe(undefined);
      done();
    };
    loader.call(opts, 'class Foo {}');
  });

  describe('html-loader', () => {
    test('image sources are replaced with require calls', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, addTemplateToPolymerElement('<img src="foo.jpg" />'));
    });

    test('html is minimized when option is set', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      opts.query.htmlLoader.minimize = true;
      loader.call(opts, addTemplateToPolymerElement(`<div id="foo">
  some text
</div>`));
    });
  });

  describe('styles', () => {
    test('simple styles are left alone', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(
        opts,
        addTemplateToPolymerElement('<style>* {background-color: transparent;}</style>'));
    });
    test('have url() calls replaced with require statements', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, addTemplateToPolymerElement('<style>* {background-image: url("foo.jpg");}</style>'));
    });

    test('font url() are properly formatted', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, addTemplateToPolymerElement(`<style>
        @font-face {
          font-family: 'MyWebFont';
          src: url('webfont.eot'); /* IE9 Compat Modes */
          src: url('webfont.eot?#iefix') format('embedded-opentype'), /* IE6-IE8 */
              url('~webfont.woff2') format('woff2'), /* Super Modern Browsers */
              url('./webfont.woff') format('woff'), /* Pretty Modern Browsers */
              url('webfont.ttf')  format('truetype'), /* Safari, Android, iOS */
              url('webfont.svg#svgFontName') format('svg'); /* Legacy iOS */
        }
        @media print {
          * {background-color: transparent;}
        }
      </style>`));
    });
    test('multiple style tags are processed', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(
        opts,
        addTemplateToPolymerElement(
          `<style>* {background-image: url("foo.jpg");}</style>
              <style>* {background-image: url("bar.jpg");}</style>`));
    });
    test('missing end tag is skipped', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(
        opts,
        addTemplateToPolymerElement('<style>* {background-image: url("foo.jpg");}'));
    });
    test('malformed begin tag is skipped', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(
        opts,
        addTemplateToPolymerElement('<style * {background-image: url("foo.jpg");}'));
    });
    test('@import statements are processed', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(
        opts,
        addTemplateToPolymerElement(
          '<style>@import url("other.css"); * {background-image: url("foo.jpg");}</style>'));
    });
  });

  describe('full components', () => {
    test('basic element', (done) => {
      opts.query.htmlLoader.minimize = true;
      opts.sourceMap = true;
      opts.async = () => async (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).not.toBe(undefined);
        await verifySourceMap(source, map);
        done();
      };
      loader.call(opts, `
import format from 'date-fns/format';
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';  

class MyElement extends PolymerElement {
  static get is() { return 'my-element'; }
  static get template() {
    return html\`<h1>Hello, World!</h1>\`;
  }
}

window.customElements.define(MyElement.is, MyElement);
`);
    });

    test('multiple template methods', (done) => {
      opts.query.htmlLoader.minimize = true;
      opts.sourceMap = true;
      opts.async = () => async (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).not.toBe(undefined);
        await verifySourceMap(source, map);
        done();
      };
      loader.call(opts, `
import format from 'date-fns/format';
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';  

class MyElement extends PolymerElement {
  static get is() { return 'my-element'; }
  static get properties() {
    return {
      today: {
        type: String,
        value: function() {
          return format(new Date(), 'MM/DD/YYYY');
        }
      }
    }
  }
  static get styles() {
    return html\`<style> 
        h1 {
          background-color: pink;
          background-image: url('foo.jpg');
        }
      </style>\`;
  }
  static get template() {
    return html\`
      \${MyElement.styles}
      <h1>
        Hello, World! It's [[today]].
      </h1>\`;
  }
}

window.customElements.define(MyElement.is, MyElement);
`);
    });

    test('html tagged references on same line', (done) => {
      opts.query.htmlLoader.minimize = true;
      opts.sourceMap = true;
      opts.async = () => async (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).not.toBe(undefined);
        await verifySourceMap(source, map);
        done();
      };
      loader.call(opts, `
import format from 'date-fns/format';
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';  

class MyElement extends PolymerElement {
  static get is() { return 'my-element'; }
  static get styles() {
    return html\`<style>* {background-color: pink;}</style>\`;
  }
  static get template() {
    return html\`<h1>Hello, World!</h1>\` && html\`\${MyElement.styles}\`;
  }
}

window.customElements.define(MyElement.is, MyElement);
`);
    });

    test('source maps account for escaped backtick', (done) => {
      opts.query.htmlLoader.minimize = true;
      opts.sourceMap = true;
      opts.async = () => async (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).not.toBe(undefined);
        await verifySourceMap(source, map);
        done();
      };
      loader.call(opts, `
import format from 'date-fns/format';
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';  

class MyElement extends PolymerElement {
  static get is() { return 'my-element'; }
  static get styles() {
    return html\`<style>* {background-color: pink;}</style>\`;
  }
  static get template() {
    return html\`foo\\\`s\${MyElement.styles}\`;
  }
}

window.customElements.define(MyElement.is, MyElement);
`);
    });
  });
});
