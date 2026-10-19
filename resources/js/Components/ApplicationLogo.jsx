export default function ApplicationLogo({ symbol = false, alt = 'iMAPS', className = '', ...props }) {
    return (
        <img
            {...props}
            src={symbol ? '/branding/imaps-symbol.svg' : '/branding/imaps-logo.svg'}
            alt={alt}
            className={`object-contain ${className}`}
        />
    );
}
