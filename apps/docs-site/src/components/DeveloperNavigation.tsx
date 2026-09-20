import React from 'react';
import Link from '@docusaurus/Link';
import { navigation } from '../../navigation';

export default function DeveloperNavigation({ current }: { current: string }) {
  return <aside className="developer-sidebar">
    <nav className="menu developer-navigation" aria-label="Documentation navigation">
      {navigation.map(group => <div className="developer-navigation-group" key={group.label}>
        <div className="developer-navigation-label">{group.label}</div>
        <ul className="menu__list">
          {group.items.map(item => <li className="menu__list-item" key={item.href}>
            <Link to={item.href}
              className={`menu__link${current === item.href ? ' menu__link--active' : ''}`}
              aria-current={current === item.href ? 'page' : undefined}>
              {item.label}
            </Link>
          </li>)}
        </ul>
      </div>)}
    </nav>
  </aside>;
}
