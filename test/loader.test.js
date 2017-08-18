/* eslint no-undefined: "off", no-useless-escape: "off" */

import sourceMap from 'source-map';
import loader from '../src';

const normalisePaths = result => result.replace('src\\\\', 'src/');

function verifySourceMap(generatedSource, map) {
  const consumer = sourceMap.SourceMapConsumer(map);
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
}

describe('loader', () => {
  let opts;

  beforeEach(() => {
    opts = {
      resourcePath: 'src/test.html',
      query: {
        htmlLoader: {
          minimize: false,
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
    loader.call(opts, '<div></div>');
  });

  test('can process without options', (done) => {
    opts.query = null;
    opts.async = () => (err, source, map) => {
      expect(err).toBe(null);
      expect(normalisePaths(source)).toMatchSnapshot();
      expect(map).toBe(undefined);
      done();
    };
    loader.call(opts, '<div></div>');
  });

  describe('links', () => {
    test('transforms links', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<link rel="import" href="foo.html">');
    });

    test('ignores links with invalid href', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<link rel="import" href="">');
    });

    test('ignoreLinks option', (done) => {
      opts.query.ignoreLinks = [
        'foo.html',
        '/bar',
        /node_modules/,
      ];
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<link rel="import" href="foo.html">' +
         '<link rel="import" href="foofoo.html">' +
         '<link rel="import" href="/bar/foo.html">' +
         '<link rel="import" href="../../node_modules/some-module/some-element.html">',
      );
    });

    test('ignoreLinksFromPartialMatches option', (done) => {
      opts.query.ignoreLinksFromPartialMatches = ['foo.html'];
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<link rel="import" href="foo.html">' +
        '<link rel="import" href="foofoo.html">');
    });

    test('ignorePathReWrite option', (done) => {
      opts.query.ignorePathReWrite = ['foo.html'];
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<link rel="import" href="foo.html">' +
        '<link rel="import" href="foofoo.html">');
    });
  });

  describe('domModule', () => {
    test('transforms dom-modules', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module id="x-foo">' +
        '<div></div></dom-module>');
    });

    test('transforms multiple dom-modules', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module id="x-foo">' +
        '<div></div></dom-module><dom-module id="x-foo-foo">' +
        '<div></div></dom-module>');
    });

    test('ignore non root level dom-modules', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<template><dom-module id="x-foo">' +
        '<div></div></dom-module></template>');
    });

    test('ignores invalid HTML', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '</td>');
    });

    test('ignore script tags in a template', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module id="x-foo"><template>' +
        '<script>var x = 1;</script></template></dom-module>');
    });

    test('removes script tags without a source', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).not.toBe(undefined);
        verifySourceMap(source, map);
        done();
      };
      loader.call(opts, '<dom-module id="x-foo">' +
        '<script>var x = 1;</script></dom-module>');
    });

    test('removes script tags without a protocol', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module id="x-foo">' +
        '<script src="foo.js"></script></dom-module>');
    });

    test('removes link tags', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<link rel="import" href="test.html">' +
        '<dom-module id="x-foo"></dom-module>');
    });

    test('keeps css link tags with import', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module id="x-foo">' +
        '<link rel="import" type="css" href="test.css"></dom-module>');
    });

    test('keeps css link tags with rel stylesheet', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module id="x-foo">' +
        '<link rel="stylesheet" href="test.css"></dom-module>');
    });

    test('adds to body if no dom-module', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<span></span>');
    });

    test('maintains links to stylesheet with an external url file', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module><template><link rel="stylesheet" href="http://example.com/test.css"></link></template></dom-module>');
    });

    test('maintains links to stylesheet with an protocol neutral href', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module><template><link rel="stylesheet" href="//example.com/test.css"></link></template></dom-module>');
    });

    test('ignores css link if flag is not set', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<dom-module><template><link rel="stylesheet" href="./test.css"></link></template></dom-module>');
    });
  });

  describe('scripts', () => {
    test('transforms scripts with a source into imports', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<script src="foo.js"></script>');
    });

    test('maintains external scripts', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<script src="http://example.com/test.js"></script>');
    });

    test('maintains inline scripts', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).not.toBe(undefined);
        verifySourceMap(source, map);
        done();
      };
      loader.call(opts, `<script>var x = 5;
        function foobar(arg) {
          var y = 6;
        
        }
      </script>`);
    });
  });

  describe('html-loader', () => {
    test('image sources are replaced with require calls', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<img src="foo.jpg" />');
    });

    test('html is minimized when option is set', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      opts.query.htmlLoader.minimize = true;
      loader.call(opts, '<script src="http://example.com/test.js"></script>');
    });
  });

  describe('styles', () => {
    test('in body have url() calls replaced with require statements', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<style>* {background-image: url("foo.jpg");}</style>');
    });

    test('in templates have url() calls replaced with require statements', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, '<template><style>* {background-image: url("foo.jpg");}</style></template>');
    });

    test('font url() are properly formatted', (done) => {
      opts.async = () => (err, source, map) => {
        expect(err).toBe(null);
        expect(normalisePaths(source)).toMatchSnapshot();
        expect(map).toBe(undefined);
        done();
      };
      loader.call(opts, `<style>
        @font-face {
          font-family: 'MyWebFont';
          src: url('webfont.eot'); /* IE9 Compat Modes */
          src: url('webfont.eot?#iefix') format('embedded-opentype'), /* IE6-IE8 */
              url('webfont.woff2') format('woff2'), /* Super Modern Browsers */
              url('webfont.woff') format('woff'), /* Pretty Modern Browsers */
              url('webfont.ttf')  format('truetype'), /* Safari, Android, iOS */
              url('webfont.svg#svgFontName') format('svg'); /* Legacy iOS */
        }
      </style>`);
    });
  });
});
