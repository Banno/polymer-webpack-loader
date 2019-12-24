/* eslint no-undefined: "off", no-useless-escape: "off" */

// const sourceMap = require('source-map');
const loader = require('../src');

const normalisePaths = result => result.replace('src\\\\', 'src/');

// function verifySourceMap(generatedSource, map) {
//   const consumer = sourceMap.SourceMapConsumer(map);
//   consumer.eachMapping((mapping) => {
//     if (!mapping.name) {
//       return;
//     }
//     const originalSourceByLine = consumer.sourceContentFor(mapping.source).split('\n');
//     const generatedSourceByLine = generatedSource.split('\n');
//
//     expect(generatedSourceByLine[mapping.generatedLine - 1].substr(mapping.generatedColumn, mapping.name.length))
//       .toBe(mapping.name);
//     expect(originalSourceByLine[mapping.originalLine - 1].substr(mapping.originalColumn, mapping.name.length))
//       .toBe(mapping.name);
//   });
// }

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

  // describe('styles', () => {
  //   test('in body have url() calls replaced with require statements', (done) => {
  //     opts.async = () => (err, source, map) => {
  //       expect(err).toBe(null);
  //       expect(normalisePaths(source)).toMatchSnapshot();
  //       expect(map).toBe(undefined);
  //       done();
  //     };
  //     loader.call(opts, '<style>* {background-image: url("foo.jpg");}</style>');
  //   });
  //
  //   test('in templates have url() calls replaced with require statements', (done) => {
  //     opts.async = () => (err, source, map) => {
  //       expect(err).toBe(null);
  //       expect(normalisePaths(source)).toMatchSnapshot();
  //       expect(map).toBe(undefined);
  //       done();
  //     };
  //     loader.call(opts, '<template><style>* {background-image: url("foo.jpg");}</style></template>');
  //   });
  //
  //   test('font url() are properly formatted', (done) => {
  //     opts.async = () => (err, source, map) => {
  //       expect(err).toBe(null);
  //       expect(normalisePaths(source)).toMatchSnapshot();
  //       expect(map).toBe(undefined);
  //       done();
  //     };
  //     loader.call(opts, `<style>
  //       @font-face {
  //         font-family: 'MyWebFont';
  //         src: url('webfont.eot'); /* IE9 Compat Modes */
  //         src: url('webfont.eot?#iefix') format('embedded-opentype'), /* IE6-IE8 */
  //             url('webfont.woff2') format('woff2'), /* Super Modern Browsers */
  //             url('webfont.woff') format('woff'), /* Pretty Modern Browsers */
  //             url('webfont.ttf')  format('truetype'), /* Safari, Android, iOS */
  //             url('webfont.svg#svgFontName') format('svg'); /* Legacy iOS */
  //       }
  //     </style>`);
  //   });
  // });

  describe('full components', () => {
    test('multiple template methods', (done) => {
      opts.query.processStyleLinks = true;
      opts.async = () => (err, source /* , map */) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        // expect(map).not.toBe(undefined);
        // verifySourceMap(source, map);
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
    return html\`<style> h1 {background-color: pink; } </style>\`;
  }
  static get template() {
    return html\`
      \${MyElement.styles}
      <h1>Hello, World! It's [[today]].</h1>\`;
  }
}

window.customElements.define(MyElement.is, MyElement);
`);
    });
  });
});
