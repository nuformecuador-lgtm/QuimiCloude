import Image from 'next/image';

type BrandAsset = {
  readonly src: string;
  readonly viewBoxWidth: number;
  readonly viewBoxHeight: number;
};

const LOGO_HORIZONTAL_ON_DARK: BrandAsset = {
  src: '/brand/logo-horizontal-dark.svg',
  viewBoxWidth: 227,
  viewBoxHeight: 48,
};

const LOGO_VERTICAL_ON_DARK: BrandAsset = {
  src: '/brand/logo-vertical-dark.svg',
  viewBoxWidth: 127,
  viewBoxHeight: 76,
};

const ISOTIPO_ON_LIGHT: BrandAsset = {
  src: '/brand/isotipo.svg',
  viewBoxWidth: 47,
  viewBoxHeight: 47,
};

const ISOTIPO_ON_DARK: BrandAsset = {
  src: '/brand/isotipo-dark.svg',
  viewBoxWidth: 47,
  viewBoxHeight: 47,
};

// En el repo solo está la versión clara del isotipo, así que `tone="auto"` solo se admite con él.
export type BrandLogoProps = (
  | { readonly variant: 'horizontal' | 'vertical'; readonly tone: 'on-dark' }
  | { readonly variant: 'isotipo'; readonly tone: 'on-dark' | 'auto' }
) & {
  readonly height: number;
  readonly alt: string;
  /** Pide la imagen desde el `<head>` y sin carga diferida: solo para el logo que es el LCP de su página. */
  readonly preload?: boolean;
};

const ON_DARK_ASSETS = {
  horizontal: LOGO_HORIZONTAL_ON_DARK,
  vertical: LOGO_VERTICAL_ON_DARK,
  isotipo: ISOTIPO_ON_DARK,
} as const;

function BrandImage({
  asset,
  height,
  alt,
  className,
  preload,
}: {
  readonly asset: BrandAsset;
  readonly height: number;
  readonly alt: string;
  readonly className?: string;
  readonly preload?: boolean;
}) {
  const width = Math.round((height * asset.viewBoxWidth) / asset.viewBoxHeight);

  return (
    <Image
      src={asset.src}
      width={width}
      height={height}
      alt={alt}
      unoptimized
      className={className}
      preload={preload}
    />
  );
}

export function BrandLogo(props: BrandLogoProps) {
  const { variant, tone, height, alt, preload } = props;

  if (variant === 'isotipo' && tone === 'auto') {
    // Las dos imágenes van en el HTML y el tema decide cuál se ve: así el servidor y el
    // cliente pintan lo mismo y no hay parpadeo al hidratar.
    return (
      <>
        <BrandImage asset={ISOTIPO_ON_LIGHT} height={height} alt={alt} className="dark:hidden" />
        <BrandImage
          asset={ISOTIPO_ON_DARK}
          height={height}
          alt={alt}
          className="hidden dark:block"
        />
      </>
    );
  }

  return (
    <BrandImage asset={ON_DARK_ASSETS[variant]} height={height} alt={alt} preload={preload} />
  );
}
