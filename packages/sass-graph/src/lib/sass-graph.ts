import fs from 'fs';
import glob from 'glob';
import _ from 'lodash';
import path from 'path';
import parseImports from './parse-imports';

// resolve a sass module to a path
function resolveSassPath(
  sassPath: string,
  loadPaths: string[],
  extensions: string[]
): string | false {
  // trim sass file extensions
  const re = new RegExp('(.(' + extensions.join('|') + '))$', 'i');
  const sassPathName = sassPath.replace(re, '');
  // check all load paths

  const length = loadPaths.length;
  let i, j, scssPath, partialPath;
  for (i = 0; i < length; i++) {
    for (j = 0; j < extensions.length; j++) {
      scssPath = path.normalize(
        loadPaths[i] + '/' + sassPathName + '.' + extensions[j]
      );
      try {
        if (fs.lstatSync(scssPath).isFile()) {
          return scssPath;
        }
      } catch (e) {}
    }

    // special case for _partials
    for (j = 0; j < extensions.length; j++) {
      scssPath = path.normalize(
        loadPaths[i] + '/' + sassPathName + '.' + extensions[j]
      );
      partialPath = path.join(
        path.dirname(scssPath),
        '_' + path.basename(scssPath)
      );
      try {
        if (fs.lstatSync(partialPath).isFile()) {
          return partialPath;
        }
      } catch (e) {}
    }
  }

  // File to import not found or unreadable so we assume this is a custom import
  return false;
}

class Graph {
  dir?: string;
  extensions: string[];
  exclude: RegExp | null;
  index: Record<string, Node> = {};
  follow: boolean;
  loadPaths: string[];
  constructor(options: GraphOptions, dir?: string) {
    this.dir = dir;
    this.extensions = options.extensions ?? [];
    this.exclude = options.exclude instanceof RegExp ? options.exclude : null;
    this.follow = options.follow || false;
    this.loadPaths =
      options.loadPaths?.map((p: string) => path.resolve(p)) ?? [];

    if (dir) {
      glob
        .sync(dir + '/**/*.@(' + this.extensions.join('|') + ')', {
          dot: true,
          nodir: true,
          follow: this.follow,
        })
        .forEach((file: string) => {
          try {
            this.addFile(path.resolve(file));
          } catch (e) {}
        });
    }
  }

  // add a sass file to the graph
  addFile(filepath: string, parent?: string) {
    if (this.exclude !== null && this.exclude.test(filepath)) return;

    const entry = (this.index[filepath] = this.index[filepath] || {
      imports: [],
      importedBy: [],
      modified: fs.statSync(filepath).mtime,
    });

    let resolvedParent;
    const isIndentedSyntax = path.extname(filepath) === '.sass';
    const imports = parseImports(
      fs.readFileSync(filepath, 'utf-8'),
      isIndentedSyntax
    );
    const cwd = path.dirname(filepath);

    let i, loadPaths, resolved;
    for (i = 0; i < imports.length; i++) {
      loadPaths = _([cwd, this.dir])
        .concat(this.loadPaths)
        .filter()
        .uniq()
        .value();
      resolved = resolveSassPath(
        imports[i],
        loadPaths as string[],
        this.extensions
      );

      if (!resolved) continue;

      // check exclcude regex
      if (this.exclude !== null && this.exclude.test(resolved)) continue;

      // recurse into dependencies if not already enumerated
      if (!_.includes(entry.imports, resolved)) {
        entry.imports.push(resolved);
        this.addFile(fs.realpathSync(resolved), filepath);
      }
    }

    // add link back to parent
    if (parent) {
      resolvedParent = this.loadPaths.find((path) => path === parent);

      if (resolvedParent) {
        resolvedParent = parent.substr(parent.indexOf(resolvedParent));
      } else {
        resolvedParent = parent;
      }

      // check exclcude regex
      if (!(this.exclude !== null && this.exclude.test(resolvedParent))) {
        entry.importedBy.push(resolvedParent);
      }
    }
  }

  // visits all files that are ancestors of the provided file
  visitAncestors(filepath: string, callback: VisitCallback) {
    this.visit(filepath, callback, (err, node) => {
      if (err || !node) return [];
      return node.importedBy;
    });
  }

  // visits all files that are descendents of the provided file
  visitDescendents(filepath: string, callback: VisitCallback) {
    this.visit(filepath, callback, (err, node) => {
      if (err || !node) return [];
      return node.imports;
    });
  }

  // a generic visitor that uses an edgeCallback to find the edges to traverse for a node
  visit(
    filepath: string,
    callback: VisitCallback,
    edgeCallback: EdgeCallback,
    visited: string[] = []
  ) {
    filepath = fs.realpathSync(filepath);
    if (!this.index.hasOwnProperty(filepath)) {
      edgeCallback("Graph doesn't contain " + filepath, null);
    }
    const edges = edgeCallback(null, this.index[filepath]);

    for (let i = 0; i < edges.length; i++) {
      if (!_.includes(visited, edges[i])) {
        visited.push(edges[i]);
        callback(edges[i], this.index[edges[i]]);
        this.visit(edges[i], callback, edgeCallback, visited);
      }
    }
  }
}

function processOptions(options: GraphOptions): GraphOptions {
  return {
    loadPaths: [process.cwd()],
    extensions: ['scss', 'sass'],
    ...options,
  };
}

export function parseFile(filepath: string, options: GraphOptions): Graph {
  if (fs.lstatSync(filepath).isFile()) {
    filepath = path.resolve(filepath);
    options = processOptions(options);
    const graph = new Graph(options);
    graph.addFile(filepath);
    return graph;
  }

  throw new Error(`Invalid file: ${filepath}`);
}

export function parseDir(dirpath: string, options: GraphOptions): Graph {
  if (fs.lstatSync(dirpath).isDirectory()) {
    dirpath = path.resolve(dirpath);
    options = processOptions(options);
    const graph = new Graph(options, dirpath);
    return graph;
  }

  throw new Error(`Invalid directory: ${dirpath}`);
}

type VisitCallback = (edge: string, node: Node) => void;
type EdgeCallback = (error: string | null, node: Node | null) => string[];

type Node = {
  imports: string[];
  importedBy: string[];
  modified: Date;
};

interface GraphOptions {
  extensions?: string[];
  exclude?: RegExp;
  follow?: boolean;
  loadPaths?: string[];
}
