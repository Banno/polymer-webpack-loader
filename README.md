# polymer-webpack-loader
[![npm version](https://badge.fury.io/js/polymer-webpack-loader.svg)](https://badge.fury.io/js/polymer-webpack-loader)
[![build status](https://travis-ci.org/webpack-contrib/polymer-webpack-loader.svg?branch=master)](https://travis-ci.org/webpack-contrib/polymer-webpack-loader)

> [Polymer](https://www.polymer-project.org/) component loader for [webpack](https://webpack.js.org/).

The loader allows you to write mixed HTML, CSS and JavaScript Polymer elements and
still use the full webpack ecosystem including module bundling and code splitting.


<img width="1024" alt="" src="https://user-images.githubusercontent.com/1066253/28131928-3b257288-66f0-11e7-8295-cb968cefb040.png">

The loader transforms your components:

 * `<link rel="import" href="./my-other-element.html">` -> `import './my-other-element.html';`
 * `<dom-module>` becomes a string which is registered at runtime
 * `<script src="./other-script.js"></script>` -> `import './other-script.js';`
 * `<script>/* contents */</script>` -> `/* contents */`

## Configuring the Loader

```javascript
{
  test: /\.html$/,  
  includes: Array (optional),
  excludes: RegEx (optional),
  options: {
    ignoreLinks: Array (optional),
    ignoreLinksFromPartialMatches: Array (optional),
    ignorePathReWrite: Array (optional)
  },
  loader: 'polymer-webpack-loader'
},
```

### Includes: Array

Directories that contain your web components. This will allow you to control where the loader can access files to process. WARNING: If this property exists the loader will only process files that have their parent directory listed. So if you have `<link>` in your components to other directories they MUST be included in this Array.

### Excludes: RegEx

A regular expression for files that the loader should exclude. NOTE: Files imported through a `<link>` will not be excluded by this property. See Options.ignoreLinks.

### Options

#### ignoreLinks: Array

An array of paths to be ignored when dynamically imported. When the component loader comes across a `<link>` in your components it dynamically imports the value of href attribute.  

#### ignoreLinksFromPartialMatches: Array

An array of paths to be ignored when dynamically imported based on match of string anywhere within the path. When the component loader comes across a `<link>` in your components it dynamically imports the value of href attribute.  

#### ignorePathReWrite: Array

Paths the loader will respect as is. In order to properly import certain paths, checks are made to ensure the path is picked up correctly by Webpack. Paths matching a value in the Array will be imported as is, you may have aliases or just want the loader to respect the path.

### Use with Babel (or other JS transpilers)
If you'd like to transpile the contents of your element's `<script>` block you can [chain an additional loader](https://webpack.js.org/configuration/module/#rule-use).

```js
module: {
  loaders: [
    {
      test: /\.html$/,
      use: [
        // Chained loaders are applied last to first
        { loader: 'babel-loader' },
        { loader: 'polymer-webpack-loader' }
      ]
    }
  ]
}

// alternative syntax

module: {
  loaders: [
    {
      test: /\.html$/,
      // Chained loaders are applied right to left
      loader: 'babel-loader!polymer-webpack-loader'
    }
  ]
}
```

### Use of HtmlWebpackPlugin
Depending on how you configure the HtmlWebpackPlugin you may encounter conflicts with the polymer-webpack-loader. 

Example: 

```javascript
{
  test: /\.html$/,
  loader: 'html-loader',
  include: [
    path.resolve(__dirname, './index.html'),
  ],
},
{
  test: /\.html$/,  
  loader: 'polymer-webpack-loader'
}
```
This would expose your index.html file to the polymer-webpack-loader based on the process used by the html-loader. In this case you would need to exclude your html file from the polymer-webpack-loader or look for other ways to avoid this conflict. See: [html-webpack-plugin template options](https://github.com/jantimon/html-webpack-plugin/blob/master/docs/template-option.md)

<h2 align="center">Maintainers</h2>

<table>
  <tbody>
    <tr>
      <td align="center">
        <a href="https://github.com/bryandcoulter">
          <img width="150" height="150" src="https://avatars.githubusercontent.com/u/18359726?v=3">
          </br>
          Bryan Coulter
        </a>
      </td>
      <td align="center">
        <a href="https://github.com/ChadKillingsworth">
          <img width="150" height="150" src="https://avatars.githubusercontent.com/u/1247639?v=3">
          </br>
          Chad Killingsworth
        </a>
      </td>
      <td align="center">
        <a href="https://github.com/robdodson">
          <img width="150" height="150" src="https://avatars.githubusercontent.com/u/1066253?v=3">
          </br>
          Rob Dodson
        </a>
      </td>
    </tr>
  <tbody>
</table>
