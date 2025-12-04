/**
 * BaroCSS Renderer DSL Usage Examples
 * 
 * This file demonstrates various usage patterns and best practices
 * for the BaroCSS Renderer DSL in real-world scenarios.
 */

import { element, data, slot, when, attr, renderer } from '../src/template-builders';
import { buildVNode } from '../src/factory';

// Example 1: Simple Blog Post Component
export function createBlogPostRegistry(): RendererRegistry {
  const reg = new RendererRegistry();
  
  // Blog post container
  reg.register(renderer('blogPost', element('article', {
    className: 'blog-post',
    style: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'Georgia, serif',
      lineHeight: '1.6'
    }
  }, [
    slot('header'),
    slot('content'),
    slot('footer')
  ])));
  
  // Post header with metadata
  reg.register(renderer('postHeader', element('header', {
    className: 'post-header',
    style: { marginBottom: '30px' }
  }, [
    element('h1', {
      className: 'post-title',
      style: { fontSize: '2.5rem', marginBottom: '10px' }
    }, [data('title', 'Untitled')]),
    element('div', {
      className: 'post-meta',
      style: { color: '#666', fontSize: '0.9rem' }
    }, [
      element('span', {}, [data('author', 'Anonymous')]),
      element('span', { style: { margin: '0 10px' } }, ['•']),
      element('time', {
        dateTime: (d: any) => d.publishDate,
        style: { color: '#666' }
      }, [data('publishDate', '')])
    ])
  ])));
  
  // Post content with rich formatting
  reg.register(renderer('postContent', element('div', {
    className: 'post-content',
    style: { marginBottom: '30px' }
  }, [
    slot('paragraphs')
  ])));
  
  // Paragraph with optional formatting
  reg.register(renderer('paragraph', element('p', {
    className: 'post-paragraph',
    style: { marginBottom: '16px' }
  }, [
    slot('content')
  ])));
  
  // Formatted text span
  reg.register(renderer('formattedText', element('span', {
    className: (d: any) => `formatted-text ${d.format || ''}`,
    style: (d: any) => {
      const styles: any = {};
      if (d.format?.includes('bold')) styles.fontWeight = '700';
      if (d.format?.includes('italic')) styles.fontStyle = 'italic';
      if (d.format?.includes('highlight')) {
        styles.backgroundColor = '#ffeb3b';
        styles.padding = '2px 4px';
        styles.borderRadius = '2px';
      }
      return styles;
    }
  }, [data('text', '')])));
  
  // Post footer with tags and actions
  reg.register(renderer('postFooter', element('footer', {
    className: 'post-footer',
    style: {
      borderTop: '1px solid #eee',
      paddingTop: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, [
    element('div', { className: 'post-tags' }, [
      slot('tags')
    ]),
    element('div', { className: 'post-actions' }, [
      slot('actions')
    ])
  ])));
  
  // Tag component
  reg.register(renderer('tag', element('span', {
    className: 'post-tag',
    style: {
      display: 'inline-block',
      backgroundColor: '#f0f0f0',
      color: '#333',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '0.8rem',
      marginRight: '8px',
      marginBottom: '4px'
    }
  }, [data('name', '')])));
  
  return reg;
}

// Example 2: Interactive Dashboard Component
export function createDashboardRegistry(): RendererRegistry {
  const reg = new RendererRegistry();
  
  // Dashboard container
  reg.register(renderer('dashboard', element('div', {
    className: 'dashboard',
    style: {
      display: 'grid',
      gridTemplateColumns: '250px 1fr',
      gridTemplateRows: '60px 1fr',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif'
    }
  }, [
    slot('header'),
    slot('sidebar'),
    slot('main')
  ])));
  
  // Dashboard header
  reg.register(renderer('dashboardHeader', element('header', {
    className: 'dashboard-header',
    style: {
      gridColumn: '1 / -1',
      backgroundColor: '#fff',
      borderBottom: '1px solid #e1e5e9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px'
    }
  }, [
    element('h1', {
      className: 'dashboard-title',
      style: { fontSize: '1.5rem', fontWeight: '600', margin: 0 }
    }, [data('title', 'Dashboard')]),
    element('div', { className: 'header-actions' }, [
      slot('actions')
    ])
  ])));
  
  // Sidebar navigation
  reg.register(renderer('sidebar', element('aside', {
    className: 'dashboard-sidebar',
    style: {
      backgroundColor: '#f8f9fa',
      borderRight: '1px solid #e1e5e9',
      padding: '20px 0'
    }
  }, [
    slot('navigation')
  ])));
  
  // Navigation item
  reg.register(renderer('navItem', element('div', {
    className: (d: any) => `nav-item ${d.active ? 'active' : ''}`,
    style: (d: any) => ({
      padding: '12px 20px',
      cursor: 'pointer',
      backgroundColor: d.active ? '#007bff' : 'transparent',
      color: d.active ? '#fff' : '#333',
      borderLeft: d.active ? '3px solid #0056b3' : '3px solid transparent',
      transition: 'all 0.2s ease'
    })
  }, [
    element('span', {
      className: 'nav-icon',
      style: { marginRight: '10px' }
    }, [data('icon', '')]),
    element('span', { className: 'nav-label' }, [data('label', '')])
  ])));
  
  // Main content area
  reg.register(renderer('mainContent', element('main', {
    className: 'dashboard-main',
    style: {
      padding: '20px',
      overflow: 'auto',
      backgroundColor: '#fff'
    }
  }, [
    slot('content')
  ])));
  
  // Card component
  reg.register(renderer('card', element('div', {
    className: 'dashboard-card',
    style: {
      backgroundColor: '#fff',
      border: '1px solid #e1e5e9',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }
  }, [
    when((d: any) => d.title, element('h3', {
      className: 'card-title',
      style: { margin: '0 0 15px 0', fontSize: '1.2rem' }
    }, [data('title', '')])),
    slot('content')
  ])));
  
  return reg;
}

// Example 3: Form Builder Component
export function createFormRegistry(): RendererRegistry {
  const reg = new RendererRegistry();
  
  // Form container
  reg.register(renderer('form', element('form', {
    className: 'form-builder',
    style: {
      maxWidth: '600px',
      margin: '0 auto',
      padding: '20px'
    }
  }, [
    slot('fields'),
    element('div', {
      className: 'form-actions',
      style: {
        display: 'flex',
        gap: '10px',
        marginTop: '20px',
        justifyContent: 'flex-end'
      }
    }, [
      slot('actions')
    ])
  ])));
  
  // Form field wrapper
  reg.register(renderer('formField', element('div', {
    className: 'form-field',
    style: { marginBottom: '20px' }
  }, [
    element('label', {
      className: 'field-label',
      style: {
        display: 'block',
        marginBottom: '5px',
        fontWeight: '500',
        color: '#333'
      }
    }, [data('label', '')]),
    slot('input'),
    when((d: any) => d.error, element('div', {
      className: 'field-error',
      style: {
        color: '#dc3545',
        fontSize: '0.875rem',
        marginTop: '5px'
      }
    }, [data('error', '')])),
    when((d: any) => d.help, element('div', {
      className: 'field-help',
      style: {
        color: '#6c757d',
        fontSize: '0.875rem',
        marginTop: '5px'
      }
    }, [data('help', '')]))
  ])));
  
  // Text input
  reg.register(renderer('textInput', element('input', {
    type: 'text',
    className: (d: any) => `form-input ${d.error ? 'error' : ''}`,
    style: (d: any) => ({
      width: '100%',
      padding: '10px',
      border: d.error ? '1px solid #dc3545' : '1px solid #ced4da',
      borderRadius: '4px',
      fontSize: '16px',
      transition: 'border-color 0.15s ease-in-out'
    }),
    placeholder: (d: any) => d.placeholder || '',
    value: (d: any) => d.value || '',
    required: (d: any) => d.required || false
  })));
  
  // Select dropdown
  reg.register(renderer('selectInput', element('select', {
    className: (d: any) => `form-select ${d.error ? 'error' : ''}`,
    style: (d: any) => ({
      width: '100%',
      padding: '10px',
      border: d.error ? '1px solid #dc3545' : '1px solid #ced4da',
      borderRadius: '4px',
      fontSize: '16px',
      backgroundColor: '#fff'
    }),
    required: (d: any) => d.required || false
  }, [
    slot('options')
  ])));
  
  // Select option
  reg.register(renderer('selectOption', element('option', {
    value: (d: any) => d.value || '',
    selected: (d: any) => d.selected || false
  }, [data('label', '')])));
  
  // Button component
  reg.register(renderer('button', element('button', {
    type: (d: any) => d.type || 'button',
    className: (d: any) => `btn ${d.variant || 'primary'}`,
    style: (d: any) => {
      const variants = {
        primary: { backgroundColor: '#007bff', color: '#fff' },
        secondary: { backgroundColor: '#6c757d', color: '#fff' },
        danger: { backgroundColor: '#dc3545', color: '#fff' },
        outline: { backgroundColor: 'transparent', color: '#007bff', border: '1px solid #007bff' }
      };
      const base = {
        padding: '10px 20px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: '500',
        transition: 'all 0.2s ease'
      };
      return { ...base, ...variants[d.variant || 'primary'] };
    },
    disabled: (d: any) => d.disabled || false
  })));
  
  return reg;
}

// Example 4: Data Table Component
export function createDataTableRegistry(): RendererRegistry {
  const reg = new RendererRegistry();
  
  // Table container
  reg.register(renderer('dataTable', element('div', {
    className: 'data-table-container',
    style: {
      backgroundColor: '#fff',
      border: '1px solid #e1e5e9',
      borderRadius: '8px',
      overflow: 'hidden'
    }
  }, [
    slot('header'),
    slot('table')
  ])));
  
  // Table header with controls
  reg.register(renderer('tableHeader', element('div', {
    className: 'table-header',
    style: {
      padding: '20px',
      borderBottom: '1px solid #e1e5e9',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, [
    element('h3', {
      className: 'table-title',
      style: { margin: 0, fontSize: '1.25rem' }
    }, [data('title', 'Data Table')]),
    element('div', { className: 'table-controls' }, [
      slot('controls')
    ])
  ])));
  
  // Search input
  reg.register(renderer('searchInput', element('input', {
    type: 'text',
    className: 'table-search',
    style: {
      padding: '8px 12px',
      border: '1px solid #ced4da',
      borderRadius: '4px',
      fontSize: '14px',
      width: '200px'
    },
    placeholder: 'Search...'
  }, [])));
  
  // Table element
  reg.register(renderer('table', element('table', {
    className: 'data-table',
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, [
    slot('thead'),
    slot('tbody')
  ])));
  
  // Table head
  reg.register(renderer('tableHead', element('thead', {
    className: 'table-head',
    style: { backgroundColor: '#f8f9fa' }
  }, [
    slot('rows')
  ])));
  
  // Table body
  reg.register(renderer('tableBody', element('tbody', {
    className: 'table-body'
  }, [
    slot('rows')
  ])));
  
  // Table row
  reg.register(renderer('tableRow', element('tr', {
    className: (d: any) => `table-row ${d.selected ? 'selected' : ''}`,
    style: (d: any) => ({
      borderBottom: '1px solid #e1e5e9',
      backgroundColor: d.selected ? '#e3f2fd' : 'transparent',
      transition: 'background-color 0.2s ease'
    })
  }, [
    slot('cells')
  ])));
  
  // Table cell
  reg.register(renderer('tableCell', element('td', {
    className: 'table-cell',
    style: {
      padding: '12px',
      textAlign: (d: any) => d.align || 'left',
      verticalAlign: 'middle'
    }
  }, [
    slot('content')
  ])));
  
  // Sortable header cell
  reg.register(renderer('sortableHeader', element('th', {
    className: (d: any) => `sortable-header ${d.sorted ? 'sorted' : ''}`,
    style: {
      padding: '12px',
      textAlign: (d: any) => d.align || 'left',
      cursor: 'pointer',
      userSelect: 'none',
      position: 'relative'
    }
  }, [
    element('span', { className: 'header-text' }, [data('label', '')]),
    element('span', {
      className: 'sort-icon',
      style: {
        marginLeft: '8px',
        fontSize: '12px',
        opacity: (d: any) => d.sorted ? '1' : '0.5'
      }
    }, [data('sortIcon', '↕')])
  ])));
  
  return reg;
}

// Example 5: Modal Dialog Component
export function createModalRegistry(): RendererRegistry {
  const reg = new RendererRegistry();
  
  // Modal overlay
  reg.register(renderer('modal', element('div', {
    className: 'modal-overlay',
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      opacity: (d: any) => d.visible ? '1' : '0',
      visibility: (d: any) => d.visible ? 'visible' : 'hidden',
      transition: 'opacity 0.3s ease, visibility 0.3s ease'
    }
  }, [
    slot('content')
  ])));
  
  // Modal content
  reg.register(renderer('modalContent', element('div', {
    className: 'modal-content',
    style: {
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '24px',
      maxWidth: '500px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto',
      position: 'relative',
      transform: (d: any) => d.visible ? 'scale(1)' : 'scale(0.9)',
      transition: 'transform 0.3s ease'
    }
  }, [
    slot('header'),
    slot('body'),
    slot('footer')
  ])));
  
  // Modal header
  reg.register(renderer('modalHeader', element('div', {
    className: 'modal-header',
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      paddingBottom: '16px',
      borderBottom: '1px solid #e1e5e9'
    }
  }, [
    element('h2', {
      className: 'modal-title',
      style: { margin: 0, fontSize: '1.5rem' }
    }, [data('title', 'Modal Title')]),
    element('button', {
      className: 'modal-close',
      style: {
        background: 'none',
        border: 'none',
        fontSize: '24px',
        cursor: 'pointer',
        color: '#666',
        padding: '0',
        width: '30px',
        height: '30px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, ['×'])])));
  
  // Modal body
  reg.register(renderer('modalBody', element('div', {
    className: 'modal-body',
    style: {
      marginBottom: '20px',
      lineHeight: '1.6'
    }
  }, [
    slot('content')
  ])));
  
  // Modal footer
  reg.register(renderer('modalFooter', element('div', {
    className: 'modal-footer',
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      paddingTop: '16px',
      borderTop: '1px solid #e1e5e9'
    }
  }, [
    slot('actions')
  ])));
  
  return reg;
}