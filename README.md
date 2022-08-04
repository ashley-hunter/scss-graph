# Sass Graph

Parses Sass files in a directory and exposes a graph of dependencies

## Install

```
npm install --save-dev @ashley-hunter/sass-graph
```

## Usage

Usage as a Node library:

```js
import sassGraph from './sass-graph';
```

## API

#### parseDir

Parses a directory and builds a dependency graph of all requested file extensions.

#### parseFile

Parses a file and builds its dependency graph.

## Options

#### loadPaths

Type: `Array`
Default: `[process.cwd]`

Directories to use when resolved `@import` directives.

#### extensions

Type: `Array`
Default: `['scss', 'sass']`

File types to be parsed.

#### follow

Type: `Boolean`
Default: `false`

Follow symbolic links.

#### exclude

Type: `RegExp`
Default: `undefined`

Exclude files matching regular expression.

## Authors

This library is based off https://github.com/xzyfer/sass-graph but was updated to use TypeScript, and support the `@use` directive.

## License

MIT
