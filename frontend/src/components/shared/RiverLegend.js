import React from 'react';

/**
 * Shared Legend component for River Charts
 */
const RiverLegend = ({
    items,
    activeItem,
    setActiveItem,
    colorScale,
    nameKey = 'name',
    variant = 'default' // 'default' or 'pill'
}) => {
    if (!items || items.length === 0) return null;

    return (
        <div className={`river-legend river-legend-${variant}`} style={{
            marginTop: '15px',
            borderTop: '1px solid #eee',
            paddingTop: '15px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            justifyContent: 'center'
        }}>
            {items.map(item => {
                const name = item[nameKey] || item;
                const isActive = activeItem === name;
                const isDimmed = activeItem && activeItem !== name;

                return (
                    <div
                        key={name}
                        onMouseEnter={() => setActiveItem(name)}
                        onMouseLeave={() => setActiveItem(null)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: variant === 'pill' ? '6px 12px' : '4px 8px',
                            backgroundColor: isActive ? (variant === 'pill' ? '#eee' : '#f0f0f0') : (variant === 'pill' ? 'white' : 'transparent'),
                            border: variant === 'pill' ? '1px solid #ddd' : 'none',
                            borderRadius: variant === 'pill' ? '20px' : '4px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            opacity: isDimmed ? 0.4 : 1,
                            boxShadow: isActive && variant === 'pill' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <div style={{
                            width: '12px',
                            height: '12px',
                            backgroundColor: colorScale(name),
                            borderRadius: variant === 'pill' ? '50%' : '2px',
                            marginRight: '8px'
                        }}></div>
                        <span style={{
                            fontSize: '12px',
                            fontWeight: variant === 'pill' ? '500' : 'normal',
                            color: '#333'
                        }}>
                            {name}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default RiverLegend;
