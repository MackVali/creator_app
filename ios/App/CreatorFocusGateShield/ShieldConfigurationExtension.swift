import ManagedSettings
import ManagedSettingsUI
import UIKit

class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        FocusGateShieldConfiguration.make()
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        FocusGateShieldConfiguration.make()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        FocusGateShieldConfiguration.make()
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        FocusGateShieldConfiguration.make()
    }
}

private enum FocusGateShieldConfiguration {
    static func make() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor(red: 0.02, green: 0.02, blue: 0.02, alpha: 0.86),
            icon: UIImage(named: "CreatorLogo"),
            title: ShieldConfiguration.Label(
                text: "FOCUS GATE",
                color: UIColor(red: 0.96, green: 0.96, blue: 0.94, alpha: 1.0)
            ),
            subtitle: ShieldConfiguration.Label(
                text: "Today's earned screen time has been used.\n\nComplete more in Creator to earn additional access.",
                color: UIColor(red: 0.72, green: 0.72, blue: 0.68, alpha: 1.0)
            )
        )
    }
}
