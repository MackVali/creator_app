import Capacitor

class CreatorBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()

        if bridge?.plugin(withName: "CreatorWidget") == nil {
            bridge?.registerPluginInstance(CreatorWidgetPlugin())
            NSLog("[CREATOR_WIDGET_SYNC] native_plugin_registered_explicitly")
        }
    }
}
