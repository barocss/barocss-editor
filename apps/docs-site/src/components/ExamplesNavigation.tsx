import React from 'react';
import Link from '@docusaurus/Link';
import examples from '../../.generated/examples.json';

export default function ExamplesNavigation({ current }: { current: string }) {
  return <aside className="developer-sidebar">
    <nav className="menu developer-navigation" aria-label="Examples navigation">
        <div className="developer-navigation-label">Live examples</div>
        <ul className="menu__list">
          {examples.map(item => <li className="menu__list-item" key={item.id}>
            <Link to={`/examples#${item.id}`}
              className={`menu__link${current === item.id ? ' menu__link--active' : ''}`}
              aria-current={current === item.id ? 'page' : undefined}>
              {item.title}
            </Link>
          </li>)}
        </ul>
    </nav>
  </aside>;
}
