# polymer-webpack-loader
## WebPack Loader for Polymer Web Components
### Breaking Change: This repo was previously component-loader. If you have local references to the component-loader please update them to reflect the polymer-webpack-loader.

This is a [webpack](https://webpack.js.org/) loader for Polymer applications and components. It has a built in module that will load your application components at runtime with the use of importNode. 

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
