# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

2.0.0 / 2017-08-18
==================
 * Feature - Rework the `ignoreLinks` option to use webpack conditions. Significantly improves the flexibility of this option.
 * Deprecated the `ignoreLinksFromPartialMatches` option. It's use case can now be handled by the `ignoreLinks` option.
 * Feature - Utilize the html-loader internally to add `<img>` sources to the dependency graph.
 * Feature - Parse and process `url()` statements in style tags to add them to the dependency graph.
 * Bug - Properly handle files with multiple root elements

1.2.6 / 2017-08-02
==================

 * Switch to using require calls instead of import statements for external scripts to avoid hoisting

1.2.5 / 2017-07-27
==================

  * Bug - Special characters where not being escaped correctly in the html

1.2.4 / 2017-07-25
==================

  * Bug - Allows external link tags to be appended to the body
  * Reworks how the link and script tag paths are converted to import statements
  
1.2.3 / 2017-07-18
==================

  * Bug - Windows import path resolution

1.2.2 / 2017-07-13
==================

  * Bug - fix the homepage link in package.json

1.2.1 / 2017-07-13
==================

  * Include runtime module in install

1.2.0 / 2017-07-13
==================

  * README Updates
  * webpack-defaults set up
  * Bug Fix - babel and source map generation
  
1.1.0 / 2017-07-12
==================

  * Docs - move to webpack-contrib

1.0.0 / 2017-07-06
==================

  * Initial release
