# City Download Portal

The city download portal lets you extract 3D data from a webscene, and download it as a mesh to work with in other software.

Built with the Arcgis Maps SDK for Javascript, React, Remix, and Tailwind CSS.

[View it live](https://paulgibbs3rd.github.io/city-download-portal/)

![The image shows a 3D map visualization of St. Gallen, Switzerland, with buildings and trees rendered in high detail. Blue-highlighted buildings are marked with length indicators ("752.33 ft" and "772.04 ft") within a selected rectangular area outlined in red. A side panel on the right displays information about the model's origin coordinates, spatial reference, and elevation, along with export options. The interface includes controls for zooming, searching locations, and selecting areas, with export options for the 3D model file in .glb format.](https://github.com/user-attachments/assets/15cb1550-4854-4853-8a66-6a995142efcd)

## Features

- Select an area to generate a mesh using interactive tools, or by providing your own georeferencing data
- Export your selection to a `.glb` file for consumption in other programs
- View georeferencing and measurment data about the selected area

## Setting up

To set up the project, clone the repository and install the dependencies:

```shell
git clone git@github.com:gunnnnii/city-download-portal.git
cd city-download-portal
npm install
```

This will install all the necessary dependencies required for the project.

## Development

You can develop your SPA app just like you would a normal Remix app. Start the development server with:

```shell
npm run dev
```

This will start the development server and watch for changes in your source files. Any changes you make to the source files will automatically reload the app in the browser.

## Deployment

The project can be automatically deployed to GitHub Pages using GitHub Actions. The deployment workflow is defined in `.github/workflows/build-deploy.yml`.

To deploy manually, you can build the project and host it anywhere:

```shell
npm run build
```

This will generate a `build` directory containing the production-ready files. You can then serve these files using any static site hosting service.

## Project structure

This project is set up using [React Remix](https://remix.run/) and follows a file-based routing convention. Below you can see a description of some important files and directories.

```
app
├── arcgis
|   ├── components
|   |   └── # various component wrappers around the @arcgis/core sdk
|   └── reactive-hooks.tsx
|       └── # hooks to allow usage of reactiveUtils in react components
├── components
|   └── # shared components that don't belong to a particular route
├── hooks
|   ├── # various shared utility hooks
│   └── queries
|       └── # queries and mutations to handle asynchronous state
├── routes
|   ├── _root
|   |   └── # contains components that define the root layout of the application (most notably the main calcite-shell)
│   ├── _root._index
|   |   └── # index is a simple splash page to catch traffic to the root url. This is where you could set up a landing page
│   └── _root.$scene
|       |   sidebar
|       |   └── # the markup for the sidebar UI
│       └── selection
|           └── # components, utilities and state to manage and visualize the users selection
└── symbology
    └── # shared symbols and colors used over the application
```

Most of the applications functionality is implemented in the the `_root.$scene` route. This is where you will find the logic for creating and visualizing the selection. `hooks/queries` also contains the logic to query the scene for features and construct the final mesh based on the selection.

Symbology contains some useful shared symbols, and color definitions.

## Loading scenes

There are two ways to load arbitrary scenes into the application.

### `data/scene-settings.json`

You can modify the `scene-settings.json` file for your deployment to add or remove web scenes from the list of items the app displays. You can optionally specify a portal URL, if you do not it will use the Maps SDK's default portal url.

### Through the url

You can also simply send a link to an arbitrary scene id. The application will try to load it and ask the user to authenticate if necessary. You can configure the items portal url by passing a search parameter. For example `https://city-download.com/YOUR_SCENE_ID?portal-url=https%3A%2F%2Fzurich.maps.arcgis.com%2F` will load the portal item with id `YOUR_SCENE_ID` in the `https://zurich.maps.arcgis.com/` portal.

## Resources

- [ArcGIS Maps SDK for JavaScript - Developer documentation](https://developers.arcgis.com/javascript/latest/)
- [ArcGIS Blog](http://blogs.esri.com/esri/arcgis/)
- [Remix](https://remix.run/)
- [React](https://react.dev/)
- [Tanstack Query](https://tanstack.com/query/latest)

## Issues

Find a bug or want to request a new feature? Please let us know by submitting an issue.

## Contributing

Esri welcomes contributions from anyone and everyone. Please see our [guidelines for contributing](https://github.com/esri/contributing).

## Licensing

Copyright 2024 Esri

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A copy of the license is available in the repository's [license.txt](./LICENSE.txt) file.
