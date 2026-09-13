import type { ReactNode } from 'react';

import './PageLayout.css';

export function Surface({
    children,
    className = '',
    padding = true,
}: {
    children: ReactNode;
    className?: string;
    padding?: boolean;
}) {
    return <section className={`app-surface ${padding ? 'app-surface-padded' : ''} ${className}`}>{children}</section>;
}

export function SectionHeader({
    title,
    description,
    icon,
    actions,
}: {
    title: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="section-header">
            {icon && <span className="section-header-icon">{icon}</span>}
            <div className="section-header-copy">
                <h2>{title}</h2>
                {description && <p>{description}</p>}
            </div>
            {actions && <div className="section-header-actions">{actions}</div>}
        </div>
    );
}
