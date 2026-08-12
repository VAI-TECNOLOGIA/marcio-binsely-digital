import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    // Encaminha Universal Links / custom schemes pro Capacitor (senão deep links quebram)
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // ⚠️ CRÍTICO: o plugin @capacitor/push-notifications escuta o NotificationCenter
    // `.capacitorDidRegisterForRemoteNotifications` pra emitir o evento 'registration'
    // pro JS. Sem esse post, o JS nunca recebe o token e /notifications/subscribe nunca é chamado.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(name: Notification.Name.capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: Notification.Name.capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // ⚠️ CRÍTICO: o @capacitor/push-notifications no iOS emite o APNs token (hex, 64 chars)
    // como valor do evento 'registration'. O Firebase Admin SDK no backend REJEITA esses
    // tokens (messaging/invalid-registration-token) e ainda PURGA o token do DB.
    // Solução: salvar o FCM token (base64-like, ~150 chars) em UserDefaults sob a chave que
    // o @capacitor/preferences lê ("CapacitorStorage.<key>"). O JS então faz
    // Preferences.get({key:'fcmToken'}) e usa ESSE token em vez do APNs hex.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        UserDefaults.standard.set(token, forKey: "CapacitorStorage.fcmToken")
        print("[push] FCM token saved (prefix=\(token.prefix(16))…)")
    }
}
