/* eslint no-undefined: "off", no-useless-escape: "off" */

import loader from '../src';

const normalisePaths = result => result.replace('src\\\\', 'src/');

describe('loader', () => {
  let opts;

  beforeEach(() => {
    opts = {
      callback: jest.fn(),
      resourcePath: 'src/test.html',
      query: {},
    };
  });

  test('can process basic input', () => {
    loader.call(opts, '<div></div>');

    const [call] = opts.callback.mock.calls;

    expect(call[0]).toBe(null);
    expect(normalisePaths(call[1])).toMatchSnapshot();
    expect(call[2]).toBe(undefined);
  });

  test('can process without options', () => {
    opts.query = null;

    loader.call(opts, '<div></div>');

    const [call] = opts.callback.mock.calls;

    expect(call[0]).toBe(null);
    expect(normalisePaths(call[1])).toMatchSnapshot();
    expect(call[2]).toBe(undefined);
  });

  describe('links', () => {
    test('transforms links', () => {
      loader.call(opts, '<link rel="import" href="foo.html">');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('ignores links with invalid href', () => {
      loader.call(opts, '<link rel="import" href="">');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('ignoreLinks option', () => {
      opts.query.ignoreLinks = ['foo.html'];

      loader.call(opts, '<link rel="import" href="foo.html">' +
        '<link rel="import" href="foofoo.html">');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('ignoreLinksFromPartialMatches option', () => {
      opts.query.ignoreLinksFromPartialMatches = ['foo.html'];

      loader.call(opts, '<link rel="import" href="foo.html">' +
        '<link rel="import" href="foofoo.html">');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('ignorePathReWrite option', () => {
      opts.query.ignorePathReWrite = ['foo.html'];

      loader.call(opts, '<link rel="import" href="foo.html">' +
        '<link rel="import" href="foofoo.html">');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });
  });

  describe('domModule', () => {
    test('transforms dom-modules', () => {
      loader.call(opts, '<dom-module id="x-foo">' +
        '<div></div></dom-module>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('ignores invalid HTML', () => {
      loader.call(opts, '</td>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('removes script tags without a source', () => {
      loader.call(opts, '<dom-module id="x-foo">' +
        '<script>var x = 1;</script></dom-module>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).not.toBe(undefined);
    });

    test('removes script tags without a protocol', () => {
      loader.call(opts, '<dom-module id="x-foo">' +
        '<script src="foo.js"></script></dom-module>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('removes link tags', () => {
      loader.call(opts, '<link rel="import" href="test.html">' +
        '<dom-module id="x-foo"></dom-module>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('adds to body if no dom-module', () => {
      loader.call(opts, '<span></span>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });
  });

  describe('scripts', () => {
    test('transforms scripts with a source into imports', () => {
      loader.call(opts, '<script src="foo.js"></script>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('maintains external scripts', () => {
      loader.call(opts, '<script src="http://example.com/test.js"></script>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).toBe(undefined);
    });

    test('maintains inline scripts', () => {
      loader.call(opts, '<script>var x = 5;</script>');

      const [call] = opts.callback.mock.calls;
      expect(call[0]).toBe(null);
      expect(normalisePaths(call[1])).toMatchSnapshot();
      expect(call[2]).not.toBe(undefined);
    });
  });
});
