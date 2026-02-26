import SwiftUI
import DeviceCheck

var isDevelopment: Bool {
	#if targetEnvironment(simulator)
	return true
	#else
	guard let receiptURL = Bundle.main.appStoreReceiptURL else { return false }
	return receiptURL.lastPathComponent == "sandboxReceipt"
	#endif
}

class SessionHandler {
	var session: URLSession

	init() async {
		let sessionConfiguration = URLSessionConfiguration.default

		let device = DCDevice.current
		if device.isSupported {
			do {
				let data = try await device.generateToken()
				let tokenString = data.base64EncodedString()
				sessionConfiguration.httpAdditionalHeaders = [
					"X-Apple-Device-Token": tokenString,
					"X-Apple-Device-Development": String(isDevelopment)
				]
			} catch DCError.featureUnsupported {
				print("DeviceCheck feature unsupported on this device")
			} catch {
				print("Failed to generate device token: \(error.localizedDescription)")
			}
		} else {
			print("Device does not support DeviceCheck")
		}

		self.session = URLSession(configuration: sessionConfiguration)
	}
}

@main
struct checkr: App {
	var body: some Scene {
		WindowGroup {
			ContentView()
		}
	}
}

struct ContentView: View {
	@AppStorage("endpointURL") private var endpointURL: String = ""
	@State private var result: String?
	@State private var didFail: Bool = false
	@State private var errorDescription: String?
	
	var body: some View {
		VStack {
			if let result {
				Image(systemName: result.contains("Failed") ? "xmark.shield" : "checkmark.shield")
					.foregroundStyle(result.contains("Failed") ? .red : .green)
					.font(.system(size: 72))
					.padding()
				Text(result)
					.font(.title)
					.padding()
			}
			
			TextField("https://checkr.<subdomain>.workers.dev", text: $endpointURL)
				.autocapitalization(.none)
				.keyboardType(.URL)
				.textContentType(.URL)
				.textFieldStyle(.roundedBorder)
				.padding()
			
			Button("Fetch") {
				Task {
					await fetch()
				}
			}
			.buttonStyle(.borderedProminent)
			.padding()
		}
		.padding()
		.alert(
			Text("Error"),
			isPresented: $didFail
		) {
			Button("OK") {}
		} message: {
			Text(errorDescription ?? "An unknown error occurred")
		}
		
	}
	
	func fetch() async {
		didFail = false
		errorDescription = nil
		do {
			if let url = URL(string: endpointURL) {
				let sessionHandler = await SessionHandler()
				let (data, _) = try await sessionHandler.session.data(from: url)
				self.result = String(data: data, encoding: .utf8)
			} else {
				print("Invalid URL")
				errorDescription = "Invalid URL"
				didFail = true
			}
		} catch {
			print("Fetch failed: \(error.localizedDescription)")
			errorDescription = error.localizedDescription
			didFail = true
		}
	}
}

#Preview {
	ContentView()
}
