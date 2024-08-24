# checkd

checkd is a Cloudflare Workers-based server implementation for [Apple's DeviceCheck framework](https://developer.apple.com/documentation/devicecheck), enabling easy validation of requests made by valid Apple devices. This project provides both the core service worker (`checkd`) and example projects (`checkr` iOS app and worker) to demonstrate how to use checkd in an end-to-end workflow.

## Table of Contents

1. [Core Implementation](#core-implementation)
2. [Examples for End-to-End Workflow](#examples-for-end-to-end-workflow)
3. [Setup and Installation](#setup-and-installation)
4. [Usage](#usage)
5. [Contributing](#contributing)
6. [License](#license)

## Core Implementation

The `checkd` service worker provides the functionality to validate whether an Apple device token is legitimate by interfacing with Apple's DeviceCheck API. Here’s how it works:

### Main Components of the `checkd` Service Worker

1. **Environment Configuration**:
    - Needs the following environment secrets: `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, and `APPLE_DEVELOPER_ID`.
    - You can follow instructions on generating a private key with your Apple ID [here](https://developer.apple.com/help/account/manage-keys/create-a-private-key/)

2. **OAuth JWT Generation**:
    - Uses the `jose` library to create a JWT (JSON Web Token) for authenticating requests to Apple's DeviceCheck API.

3. **Device Token Validation**:
    - Receives the device token from incoming requests.
    - Constructs a JWT containing the device token and other required claim information.
    - Sends the JWT to Apple's DeviceCheck API for validation.

4. **Response Handling**:
    - Processes the response from Apple's DeviceCheck API to return whether the validation succeeded or failed.

### Key Files

- **`src/index.ts`**: The main worker file where the functionality resides.
- **`wrangler.toml`**: Configuration file for deploying the worker with Cloudflare Wrangler.
- **`tsconfig.json`**: TypeScript configuration file.
- **Environment Variables**: These include `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_DEVELOPER_ID`.

## Examples for End-to-End Workflow

To showcase the functionality of `checkd`, the project includes example implementations—a companion worker (`checkr`) and an iOS app (`checkr`).

### Checkr Worker

The `checkr` worker acts as an intermediary between the client (iOS app) and the `checkd` service worker.

### Checkr iOS App

The `checkr` iOS App demonstrates client-side implementation:

1. **Device Token Generation**:
    - Uses Apple's `DCDevice` to generate a device token on an iOS device.

2. **Request to Checkr Worker**:
    - Sends the generated device token to the `checkr` worker.

3. **Validation Workflow**:
    - The `checkr` worker forwards the request to the `checkd` service worker.
    - The `checkd` worker then validates the device token with Apple's DeviceCheck API.
    - Returns the validation result back through the `checkr` worker to the iOS app.

### Key Files in Examples

- **Worker**: The main implementation file `src/index.ts` and configuration files (`wrangler.toml`, `tsconfig.json`).
- **iOS App**: `ContentView.swift` managing the UI flow, and `SessionHandler.swift` handling the DeviceCheck logic.

## Setup and Installation

To set up and run the `checkd` project, follow these steps:

### Clone the Repository

```sh
git clone https://github.com/yourusername/checkd.git
cd checkd
```

### Install Dependencies

For the `checkd` worker:

```sh
cd checkd
npm install
```

For the `checkr` worker:

```sh
cd checkd/examples/worker
npm install
```

For the iOS app:

```sh
cd checkd/examples/app/checkr
# Open the Xcode project or workspace file, resolve dependencies if needed
```

### Set Environment Variables

Define the required environment variables (APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_DEVELOPER_ID) in the `wrangler.toml` file or via the Cloudflare Dashboard.

### Deploy the Cloudflare Worker

Deploy the `checkd` and `checkr` workers:

For `checkd`:
```sh
cd checkd
npm run deploy
```

For `checkr`:
```sh
cd checkd/examples/worker
npm run deploy
```

### Run the iOS App

Open `checkd/examples/app/checkr/checkr.xcodeproj` in Xcode, configure your signing information, and build and run the app on a physical device. Device tokens cannot be generated in a simulator.

## Contributing

We welcome contributions to enhance checkd. Feel free to open issues and submit PRs on our GitHub repository.

### Getting Started

1. Fork the repository on GitHub.
2. Clone the fork to your local machine.
3. Create a new branch for your feature or bugfix.
4. Make your changes.
5. Push the branch to GitHub and open a pull request.

Make sure to add tests for your changes. Ensure that all existing and new tests pass before submitting a pull request.

## License

checkd is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
