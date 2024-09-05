import SwiftUI
import DeviceCheck

class SessionHandler {
	var session: URLSession
	
	init() async {
		let sessionConfiguration = URLSessionConfiguration.default
		
		let device = DCDevice.current
		if device.isSupported {
			print("Device supports DeviceCheck")
			if let data = try? await device.generateToken() {
				print("Device token: \(data.base64EncodedString())")
				let tokenString = data.base64EncodedString()
#if DEBUG
				sessionConfiguration.httpAdditionalHeaders = ["X-Apple-Device-Development": "true"]
#else
				sessionConfiguration.httpAdditionalHeaders = ["X-Apple-Device-Development": "false"]
#endif
				sessionConfiguration.httpAdditionalHeaders = ["X-Apple-Device-Token": tokenString]

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
