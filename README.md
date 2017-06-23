# component-loader
## WebPack Loader for Polymer Web Components

This is a [webpack](https://webpack.js.org/) loader for Polymer applications and components. It has a built in module that will load your application components at runtime with the use of importNode. 

```javascript
{
  test: /\.html$/,  
  includes: Array (optional),
  excludes: RegEx (optional),
  options: {
    ignoreLinks: Array (optional),
    ignorePathReWrite: Array (optional)
  },
  loader: 'component-loader'
},
```
### Includes: Array

Directories that contain your web components. This will allow you to control where the loader can access files to process. WARNING: If this property exists the loader will only process files that have their parent directory listed. So if you have `<link>` in your components to other directories they MUST be included in this Array.

### Excludes: RegEx

A regular expression for files that the loader should exclude. NOTE: Files imported through a `<link>` will not be excluded by this property. See Options.ignoreLinks.

### Options

#### ignoreLinks: Array

An array of paths to be ignored when dynamically imported. When the component loader comes across a `<link>` in your components it dynamically imports the value of href attribute.  

#### ignorePathReWrite: Array

Paths the loader will respect as is. In order to properly import certain paths, checks are made to ensure the path is picked up correctly by Webpack. Paths matching a value in the Array will be imported as is, you may have aliases or just want the loader to respect the path.

### Use of HtmlWebpackPlugin
Depending on how you configure the HtmlWebpackPlugin you may encounter conflicts with the component-loader. 

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
  loader: 'component-loader'
}
```
This would expose your index.html file to the component-loader based on the process used by the html-loader. In this case you would need to exclude your html file from the component-loader or look for other ways to avoid this conflict. See: [html-webpack-plugin template options](https://github.com/jantimon/html-webpack-plugin/blob/master/docs/template-option.md)
