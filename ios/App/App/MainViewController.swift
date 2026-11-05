import UIKit
import Capacitor

// The app's screen: Capacitor's web view, plus our own plugin (PhoneSettings), which lives in
// the app rather than in a package and so has to be registered by hand.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhoneSettings())
        // Paper, light or dark like the phone, while the page loads (not a white flash).
        let paper = UIColor(named: "LaunchBackground")
        view.backgroundColor = paper
        webView?.isOpaque = false
        webView?.backgroundColor = paper
        webView?.scrollView.backgroundColor = paper
        hideKeyboardBar()
    }

    // Safari's bar above the keyboard (previous, next, done) has nothing to do in our few
    // text boxes, and makes the app feel like a web page. WebKit has no switch for it, so the
    // view that asks for it gets a subclass that answers "no bar" (what Capacitor's own
    // Keyboard plugin does, without adding that plugin to Android too).
    private func hideKeyboardBar() {
        guard let content = webView?.scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }),
              let base: AnyClass = object_getClass(content) else { return }
        let name = "\(NSStringFromClass(base))_NoKeyboardBar"
        var plain: AnyClass? = NSClassFromString(name)
        if plain == nil, let made = objc_allocateClassPair(base, name, 0) {
            let noBar: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }
            let method = class_getInstanceMethod(UIView.self, #selector(getter: UIResponder.inputAccessoryView))!
            class_addMethod(made, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(noBar), method_getTypeEncoding(method))
            objc_registerClassPair(made)
            plain = made
        }
        if let plain = plain { object_setClass(content, plain) }
    }
}

// Opens this app's notification settings, so a reader who once said "Don't Allow" can turn
// reminders back on (iOS never asks twice). Before iOS 16, the app's own settings page.
@objc(PhoneSettings)
public class PhoneSettings: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoneSettings"
    public let jsName = "PhoneSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openNotifications", returnType: CAPPluginReturnPromise)
    ]

    @objc func openNotifications(_ call: CAPPluginCall) {
        var address = UIApplication.openSettingsURLString
        if #available(iOS 16.0, *) { address = UIApplication.openNotificationSettingsURLString }
        DispatchQueue.main.async {
            if let url = URL(string: address) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }
}
