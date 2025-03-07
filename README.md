# Native RPC Communication Library

Cross-platform and cross-language communication library for Typescript, Node.JS, and Webpack. 
Part of larger [Native RPC](https://github.com/nativerpc) framework. See [nrpc-examples/README.md](https://github.com/nativerpc/nrpc-examples) for more information.

# Prerequisites

Configuring developer tooling on Ubuntu.

```
pip install setuptools
pip install build packaging
pip install pytest colorama ipython
```

Configuring developer tooling on Windows.

- Install CMake 3.31 (or older)
- Install Visual Studio Community 2022 (or older)
- Install Node.JS 22.14 (or older)

# Dependency build

Configuring and building dependencies.

```
cmake -B build
npm i
```

# Normal build

Building and testing 'nrpc-ts' code.

```
npm run build
```

# Manual testing

Technologies utilized by this projects can be tested with the following scripts:

```
npx ts-node test/test_zmq.ts
npx ts-node test/test_cmd_line.ts
npx ts-node test/test_typescript.ts
npx ts-node test/test_class.ts
npx ts-node test/test_compiler.ts
npx ts-node test/test_express.ts
npx ts-node test/test_show_cli.ts
npx ts-node test/test_show/test_show.ts
npm run show
```
