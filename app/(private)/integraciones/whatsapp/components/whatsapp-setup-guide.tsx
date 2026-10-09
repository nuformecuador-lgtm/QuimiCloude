export const WHATSAPP_SETUP_GUIDE_TESTID = 'whatsapp-setup-guide';

export const WHATSAPP_SETUP_GUIDE_TITLE = 'Dónde sacar cada dato en Meta';

export const WHATSAPP_SETUP_GUIDE_STEPS = [
  'App ID y App Secret: en developers.facebook.com, tu app › Configuración › Básica.',
  'WABA ID y Phone Number ID: tu app › WhatsApp › Configuración de la API.',
  'Access Token: business.facebook.com › Configuración › Usuarios del sistema › Generar token, con los permisos whatsapp_business_management y whatsapp_business_messaging.',
] as const;

export function WhatsappSetupGuide() {
  return (
    <section
      aria-labelledby="whatsapp-setup-guide-title"
      data-testid={WHATSAPP_SETUP_GUIDE_TESTID}
      className="flex flex-col gap-2 rounded-lg border p-4"
    >
      <h2 id="whatsapp-setup-guide-title" className="text-base font-medium">
        {WHATSAPP_SETUP_GUIDE_TITLE}
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        {WHATSAPP_SETUP_GUIDE_STEPS.map((step) => (
          <li key={step} className="break-words">
            {step}
          </li>
        ))}
      </ul>
    </section>
  );
}
