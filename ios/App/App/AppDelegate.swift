import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        dispatchCreatorAppActiveEvent()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if handleCreatorDeepLink(url) {
            return true
        }

        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }


    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
            } else if let token = token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    private func handleCreatorDeepLink(_ url: URL) -> Bool {
        guard url.scheme == "creator" else {
            return false
        }

        let route = creatorRoute(for: url)
        guard route == "/focus-pomo" else {
            return false
        }

        navigateCapacitorWebView(to: route)
        return true
    }

    private func creatorRoute(for url: URL) -> String {
        let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let path = url.path.trimmingCharacters(in: .whitespacesAndNewlines)

        if host == "focus-pomo" {
            return "/focus-pomo"
        }

        if path == "/focus-pomo" {
            return "/focus-pomo"
        }

        return path.isEmpty ? "/" : path
    }

    private func navigateCapacitorWebView(to route: String) {
        let escapedRoute = route.replacingOccurrences(of: "'", with: "\\'")
        let script = "window.location.assign('\(escapedRoute)')"

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            self?.evaluateCreatorRouteScript(script)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.evaluateCreatorRouteScript(script)
        }
    }

    private func evaluateCreatorRouteScript(_ script: String) {
        guard
            let bridgeViewController = window?.rootViewController as? CAPBridgeViewController,
            let webView = bridgeViewController.bridge?.webView
        else {
            return
        }

        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func dispatchCreatorAppActiveEvent() {
        let script = "window.dispatchEvent(new CustomEvent('creator:app-active',{detail:{source:'ios_application_did_become_active'}}))"

        DispatchQueue.main.async { [weak self] in
            self?.evaluateCreatorRouteScript(script)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.evaluateCreatorRouteScript(script)
        }
    }

}
