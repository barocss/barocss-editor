# Portal Use Cases and Patterns

## Overview

This document provides real use cases and best practices for using BaroCSS Editor's Portal system. It explains how to implement common UI patterns like modals, tooltips, and dropdowns using Portals.

## 1. Modal

### Basic Modal

```typescript
define('modal-component', (props, ctx) => {
  ctx.initState('isOpen', false);
  
  return element('div', [
    element('button', {
      onClick: () => ctx.setState('isOpen', true)
    }, [text('Open Modal')]),
    
    when(ctx.getState('isOpen'),
      portal(document.body, element('div', {
        className: 'modal-overlay',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        },
        onClick: () => ctx.setState('isOpen', false)
      }, [
        element('div', {
          className: 'modal-content',
          style: {
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          },
          onClick: (e) => e.stopPropagation()
        }, [
          element('h2', [text('Modal Title')]),
          element('p', [text('Modal content goes here...')]),
          element('button', {
            onClick: () => ctx.setState('isOpen', false)
          }, [text('Close')])
        ])
      ]), 'modal')
    )
  ]);
});
```

### Dynamic Modal Content

```typescript
define('dynamic-modal', (props, ctx) => {
  ctx.initState('isOpen', false);
  ctx.initState('modalType', 'info');
  
  const getModalContent = () => {
    const type = ctx.getState('modalType');
    switch (type) {
      case 'warning':
        return {
          title: 'Warning',
          content: 'This action cannot be undone.',
          color: 'orange'
        };
      case 'error':
        return {
          title: 'Error',
          content: 'Something went wrong.',
          color: 'red'
        };
      default:
        return {
          title: 'Information',
          content: 'Here is some information.',
          color: 'blue'
        };
    }
  };
  
  return element('div', [
    element('div', { className: 'modal-triggers' }, [
      element('button', {
        onClick: () => {
          ctx.setState('modalType', 'info');
          ctx.setState('isOpen', true);
        }
      }, [text('Info Modal')]),
      
      element('button', {
        onClick: () => {
          ctx.setState('modalType', 'warning');
          ctx.setState('isOpen', true);
        }
      }, [text('Warning Modal')]),
      
      element('button', {
        onClick: () => {
          ctx.setState('modalType', 'error');
          ctx.setState('isOpen', true);
        }
      }, [text('Error Modal')])
    ]),
    
    when(ctx.getState('isOpen'),
      portal(document.body, element('div', {
        className: 'modal-overlay',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        },
        onClick: () => ctx.setState('isOpen', false)
      }, [
        element('div', {
          className: 'modal-content',
          style: {
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: `3px solid ${getModalContent().color}`,
            maxWidth: '400px',
            width: '90%'
          },
          onClick: (e) => e.stopPropagation()
        }, [
          element('h2', {
            style: { color: getModalContent().color }
          }, [text(getModalContent().title)]),
          element('p', [text(getModalContent().content)]),
          element('button', {
            onClick: () => ctx.setState('isOpen', false)
          }, [text('Close')])
        ])
      ]), 'dynamic-modal')
    )
  ]);
});
```

## 2. Tooltip

### Basic Tooltip

```typescript
define('tooltip-component', (props, ctx) => {
  ctx.initState('showTooltip', false);
  ctx.initState('tooltipPosition', { x: 0, y: 0 });
  
  const handleMouseEnter = (e: MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    ctx.setState('tooltipPosition', {
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    ctx.setState('showTooltip', true);
  };
  
  const handleMouseLeave = () => {
    ctx.setState('showTooltip', false);
  };
  
  return element('div', [
    element('button', {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave
    }, [text('Hover for tooltip')]),
    
    when(ctx.getState('showTooltip'),
      portal(document.body, element('div', {
        className: 'tooltip',
        style: {
          position: 'fixed',
          left: `${ctx.getState('tooltipPosition').x}px`,
          top: `${ctx.getState('tooltipPosition').y}px`,
          transform: 'translateX(-50%) translateY(-100%)',
          backgroundColor: 'black',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '14px',
          zIndex: 1000,
          pointerEvents: 'none'
        }
      }, [
        text('This is a tooltip')
      ]), 'tooltip')
    )
  ]);
});
```

### Dynamic Tooltip Content

```typescript
define('dynamic-tooltip', (props, ctx) => {
  ctx.initState('showTooltip', false);
  ctx.initState('tooltipContent', '');
  ctx.initState('tooltipPosition', { x: 0, y: 0 });
  
  const items = [
    { id: 1, name: 'Item 1', description: 'Description for item 1' },
    { id: 2, name: 'Item 2', description: 'Description for item 2' },
    { id: 3, name: 'Item 3', description: 'Description for item 3' }
  ];
  
  const handleMouseEnter = (item: any, e: MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    ctx.setState('tooltipPosition', {
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    ctx.setState('tooltipContent', item.description);
    ctx.setState('showTooltip', true);
  };
  
  const handleMouseLeave = () => {
    ctx.setState('showTooltip', false);
  };
  
  return element('div', [
    element('ul', { className: 'item-list' }, [
      ...items.map(item =>
        element('li', {
          key: item.sid,
          onMouseEnter: (e) => handleMouseEnter(item, e),
          onMouseLeave: handleMouseLeave,
          style: {
            padding: '8px',
            border: '1px solid #ccc',
            margin: '4px 0',
            cursor: 'pointer'
          }
        }, [text(item.name)])
      )
    ]),
    
    when(ctx.getState('showTooltip'),
      portal(document.body, element('div', {
        className: 'tooltip',
        style: {
          position: 'fixed',
          left: `${ctx.getState('tooltipPosition').x}px`,
          top: `${ctx.getState('tooltipPosition').y}px`,
          transform: 'translateX(-50%) translateY(-100%)',
          backgroundColor: 'black',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '14px',
          zIndex: 1000,
          pointerEvents: 'none',
          maxWidth: '200px'
        }
      }, [
        text(ctx.getState('tooltipContent'))
      ]), 'dynamic-tooltip')
    )
  ]);
});
```

## 3. Dropdown

### Basic Dropdown

```typescript
define('dropdown-component', (props, ctx) => {
  ctx.initState('isOpen', false);
  ctx.initState('selectedValue', '');
  
  const options = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' }
  ];
  
  const handleSelect = (value: string, label: string) => {
    ctx.setState('selectedValue', value);
    ctx.setState('isOpen', false);
  };
  
  return element('div', { className: 'dropdown-container' }, [
    element('button', {
      className: 'dropdown-trigger',
      onClick: () => ctx.setState('isOpen', !ctx.getState('isOpen')),
      style: {
        padding: '8px 16px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        backgroundColor: 'white',
        cursor: 'pointer'
      }
    }, [
      text(ctx.getState('selectedValue') || 'Select an option')
    ]),
    
    when(ctx.getState('isOpen'),
      portal(document.body, element('div', {
        className: 'dropdown-overlay',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          zIndex: 1000
        },
        onClick: () => ctx.setState('isOpen', false)
      }, [
        element('div', {
          className: 'dropdown-menu',
          style: {
            position: 'fixed',
            top: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            minWidth: '200px'
          },
          onClick: (e) => e.stopPropagation()
        }, [
          ...options.map(option =>
            element('div', {
              key: option.value,
              className: 'dropdown-item',
              onClick: () => handleSelect(option.value, option.label),
              style: {
                padding: '8px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee'
              }
            }, [text(option.label)])
          )
        ])
      ]), 'dropdown')
    )
  ]);
});
```

### Searchable Dropdown

```typescript
define('searchable-dropdown', (props, ctx) => {
  ctx.initState('isOpen', false);
  ctx.initState('searchTerm', '');
  ctx.initState('selectedValue', '');
  
  const allOptions = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry' },
    { value: 'date', label: 'Date' },
    { value: 'elderberry', label: 'Elderberry' }
  ];
  
  const filteredOptions = allOptions.filter(option =>
    option.label.toLowerCase().includes(ctx.getState('searchTerm').toLowerCase())
  );
  
  const handleSelect = (value: string, label: string) => {
    ctx.setState('selectedValue', value);
    ctx.setState('isOpen', false);
    ctx.setState('searchTerm', '');
  };
  
  return element('div', { className: 'searchable-dropdown' }, [
    element('button', {
      className: 'dropdown-trigger',
      onClick: () => ctx.setState('isOpen', !ctx.getState('isOpen')),
      style: {
        padding: '8px 16px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        backgroundColor: 'white',
        cursor: 'pointer',
        width: '200px',
        textAlign: 'left'
      }
    }, [
      text(ctx.getState('selectedValue') || 'Search and select...')
    ]),
    
    when(ctx.getState('isOpen'),
      portal(document.body, element('div', {
        className: 'dropdown-overlay',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          zIndex: 1000
        },
        onClick: () => ctx.setState('isOpen', false)
      }, [
        element('div', {
          className: 'dropdown-menu',
          style: {
            position: 'fixed',
            top: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            width: '200px'
          },
          onClick: (e) => e.stopPropagation()
        }, [
          element('input', {
            type: 'text',
            placeholder: 'Search...',
            value: ctx.getState('searchTerm'),
            onInput: (e) => ctx.setState('searchTerm', e.target.value),
            style: {
              width: '100%',
              padding: '8px',
              border: 'none',
              borderBottom: '1px solid #eee',
              outline: 'none'
            }
          }),
          ...filteredOptions.map(option =>
            element('div', {
              key: option.value,
              className: 'dropdown-item',
              onClick: () => handleSelect(option.value, option.label),
              style: {
                padding: '8px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee'
              }
            }, [text(option.label)])
          )
        ])
      ]), 'searchable-dropdown')
    )
  ]);
});
```

## 4. Notification

### Toast Notification

```typescript
define('notification-system', (props, ctx) => {
  ctx.initState('notifications', []);
  
  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    const notification = { id, message, type, timestamp: Date.now() };
    ctx.setState('notifications', [...ctx.getState('notifications'), notification]);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      ctx.setState('notifications', 
        ctx.getState('notifications').filter((n: any) => n.sid !== id)
      );
    }, 3000);
  };
  
  const removeNotification = (id: string) => {
    ctx.setState('notifications', 
      ctx.getState('notifications').filter((n: any) => n.sid !== id)
    );
  };
  
  return element('div', [
    element('div', { className: 'notification-triggers' }, [
      element('button', {
        onClick: () => addNotification('Success message!', 'success')
      }, [text('Success')]),
      
      element('button', {
        onClick: () => addNotification('Error message!', 'error')
      }, [text('Error')]),
      
      element('button', {
        onClick: () => addNotification('Info message!', 'info')
      }, [text('Info')])
    ]),
    
    // Notification Portal
    portal(document.body, element('div', {
      className: 'notification-container',
      style: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000
      }
    }, [
      ...ctx.getState('notifications').map((notification: any) =>
        element('div', {
          key: notification.sid,
          className: `notification notification-${notification.type}`,
          style: {
            backgroundColor: notification.type === 'success' ? '#4CAF50' : 
                           notification.type === 'error' ? '#f44336' : '#2196F3',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '4px',
            marginBottom: '8px',
            minWidth: '300px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
          }
        }, [
          element('span', [text(notification.message)]),
          element('button', {
            onClick: () => removeNotification(notification.sid),
            style: {
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '18px',
              marginLeft: '8px'
            }
          }, [text('×')])
        ])
      )
    ]), 'notifications')
  ]);
});
```

## 5. Sidebar

### Sliding Sidebar

```typescript
define('sidebar-component', (props, ctx) => {
  ctx.initState('isOpen', false);
  
  const toggleSidebar = () => {
    ctx.setState('isOpen', !ctx.getState('isOpen'));
  };
  
  return element('div', [
    element('button', {
      onClick: toggleSidebar,
      style: {
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 1001,
        padding: '8px 16px',
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    }, [text('Toggle Sidebar')]),
    
    // Sidebar overlay
    when(ctx.getState('isOpen'),
      portal(document.body, element('div', {
        className: 'sidebar-overlay',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        },
        onClick: () => ctx.setState('isOpen', false)
      }, [
        element('div', {
          className: 'sidebar',
          style: {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '300px',
            height: '100%',
            backgroundColor: 'white',
            boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)',
            transform: ctx.getState('isOpen') ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s ease',
            zIndex: 1001
          },
          onClick: (e) => e.stopPropagation()
        }, [
          element('div', {
            className: 'sidebar-header',
            style: {
              padding: '20px',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }
          }, [
            element('h2', [text('Sidebar')]),
            element('button', {
              onClick: () => ctx.setState('isOpen', false),
              style: {
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer'
              }
            }, [text('×')])
          ]),
          
          element('div', {
            className: 'sidebar-content',
            style: { padding: '20px' }
          }, [
            element('ul', { className: 'sidebar-menu' }, [
              element('li', { style: { marginBottom: '10px' } }, [
                element('a', { href: '#' }, [text('Home')])
              ]),
              element('li', { style: { marginBottom: '10px' } }, [
                element('a', { href: '#' }, [text('About')])
              ]),
              element('li', { style: { marginBottom: '10px' } }, [
                element('a', { href: '#' }, [text('Contact')])
              ])
            ])
          ])
        ])
      ]), 'sidebar')
    )
  ]);
});
```

## 6. Portal and State Management Patterns

### Global State Management

```typescript
// Global state manager
class PortalStateManager {
  private static instance: PortalStateManager;
  private state: Map<string, any> = new Map();
  private listeners: Map<string, Set<Function>> = new Map();
  
  static getInstance(): PortalStateManager {
    if (!PortalStateManager.instance) {
      PortalStateManager.instance = new PortalStateManager();
    }
    return PortalStateManager.instance;
  }
  
  setState(key: string, value: any): void {
    this.state.set(key, value);
    this.notifyListeners(key, value);
  }
  
  getState(key: string): any {
    return this.state.get(key);
  }
  
  subscribe(key: string, callback: Function): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);
  }
  
  unsubscribe(key: string, callback: Function): void {
    this.listeners.get(key)?.delete(callback);
  }
  
  private notifyListeners(key: string, value: any): void {
    this.listeners.get(key)?.forEach(callback => callback(value));
  }
}

// Portal component using global state
define('global-state-portal', (props, ctx) => {
  const stateManager = PortalStateManager.getInstance();
  
  ctx.initState('localValue', '');
  
  const handleGlobalChange = (value: any) => {
    ctx.setState('localValue', value);
  };
  
  // Subscribe to global state
  stateManager.subscribe('globalMessage', handleGlobalChange);
  
  return element('div', [
    element('button', {
      onClick: () => stateManager.setState('globalMessage', 'Hello from Portal!')
    }, [text('Update Global State')]),
    
    portal(document.body, element('div', {
      className: 'global-state-portal',
      style: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: 'lightblue',
        padding: '10px',
        borderRadius: '4px'
      }
    }, [
      text(`Global State: ${ctx.getState('localValue')}`)
    ]), 'global-state-portal')
  ]);
});
```

### Portal-to-Portal Communication

```typescript
// Event system for Portal-to-Portal communication
class PortalEventBus {
  private static instance: PortalEventBus;
  private events: Map<string, Set<Function>> = new Map();
  
  static getInstance(): PortalEventBus {
    if (!PortalEventBus.instance) {
      PortalEventBus.instance = new PortalEventBus();
    }
    return PortalEventBus.instance;
  }
  
  emit(event: string, data: any): void {
    this.events.get(event)?.forEach(callback => callback(data));
  }
  
  on(event: string, callback: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);
  }
  
  off(event: string, callback: Function): void {
    this.events.get(event)?.delete(callback);
  }
}

// Sender Portal
define('sender-portal', (props, ctx) => {
  const eventBus = PortalEventBus.getInstance();
  
  return element('div', [
    element('button', {
      onClick: () => eventBus.emit('portal-message', { 
        from: 'sender', 
        message: 'Hello from sender!' 
      })
    }, [text('Send Message')]),
    
    portal(document.body, element('div', {
      className: 'sender-portal',
      style: {
        position: 'fixed',
        top: '20px',
        left: '20px',
        backgroundColor: 'lightgreen',
        padding: '10px',
        borderRadius: '4px'
      }
    }, [
      text('Sender Portal')
    ]), 'sender-portal')
  ]);
});

// Receiver Portal
define('receiver-portal', (props, ctx) => {
  const eventBus = PortalEventBus.getInstance();
  
  ctx.initState('receivedMessage', '');
  
  const handleMessage = (data: any) => {
    ctx.setState('receivedMessage', data.message);
  };
  
  eventBus.on('portal-message', handleMessage);
  
  return element('div', [
    portal(document.body, element('div', {
      className: 'receiver-portal',
      style: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: 'lightcoral',
        padding: '10px',
        borderRadius: '4px'
      }
    }, [
      text(`Received: ${ctx.getState('receivedMessage')}`)
    ]), 'receiver-portal')
  ]);
});
```

## 7. Portal Accessibility Considerations

### Keyboard Navigation

```typescript
define('accessible-modal', (props, ctx) => {
  ctx.initState('isOpen', false);
  ctx.initState('focusedElement', null);
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      ctx.setState('isOpen', false);
    }
  };
  
  const trapFocus = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      const modal = document.querySelector('.modal-content');
      if (modal) {
        const focusableElements = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    }
  };
  
  return element('div', [
    element('button', {
      onClick: () => ctx.setState('isOpen', true),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          ctx.setState('isOpen', true);
        }
      }
    }, [text('Open Accessible Modal')]),
    
    when(ctx.getState('isOpen'),
      portal(document.body, element('div', {
        className: 'modal-overlay',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        },
        onClick: () => ctx.setState('isOpen', false),
        onKeyDown: handleKeyDown
      }, [
        element('div', {
          className: 'modal-content',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'modal-title',
          style: {
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%'
          },
          onClick: (e) => e.stopPropagation(),
          onKeyDown: trapFocus
        }, [
          element('h2', {
            id: 'modal-title'
          }, [text('Accessible Modal')]),
          
          element('p', [text('This modal is accessible with keyboard navigation.')]),
          
          element('div', { className: 'modal-actions' }, [
            element('button', {
              onClick: () => ctx.setState('isOpen', false),
              autoFocus: true
            }, [text('Close')]),
            
            element('button', {
              onClick: () => console.log('Action performed')
            }, [text('Confirm')])
          ])
        ])
      ]), 'accessible-modal')
    )
  ]);
});
```

### Screen Reader Support

```typescript
define('screen-reader-portal', (props, ctx) => {
  ctx.initState('announcement', '');
  
  const announce = (message: string) => {
    ctx.setState('announcement', message);
    
    // Remove announcement after 3 seconds
    setTimeout(() => {
      ctx.setState('announcement', '');
    }, 3000);
  };
  
  return element('div', [
    element('button', {
      onClick: () => announce('Button clicked successfully!')
    }, [text('Click me')]),
    
    // Screen reader-only announcement area
    portal(document.body, element('div', {
      'aria-live': 'polite',
      'aria-atomic': 'true',
      style: {
        position: 'absolute',
        left: '-10000px',
        width: '1px',
        height: '1px',
        overflow: 'hidden'
      }
    }, [
      text(ctx.getState('announcement'))
    ]), 'screen-reader-announcements')
  ]);
});
```

## 8. Performance Optimization Patterns

### Portal Lazy Loading

```typescript
define('lazy-portal', (props, ctx) => {
  ctx.initState('isOpen', false);
  ctx.initState('isLoaded', false);
  
  const loadPortalContent = () => {
    if (!ctx.getState('isLoaded')) {
      // Simulate heavy content loading
      setTimeout(() => {
        ctx.setState('isLoaded', true);
      }, 1000);
    }
  };
  
  const openPortal = () => {
    ctx.setState('isOpen', true);
    loadPortalContent();
  };
  
  return element('div', [
    element('button', {
      onClick: openPortal
    }, [text('Open Heavy Portal')]),
    
    when(ctx.getState('isOpen'),
      portal(document.body, element('div', {
        className: 'lazy-portal',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        },
        onClick: () => ctx.setState('isOpen', false)
      }, [
        element('div', {
          className: 'portal-content',
          style: {
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%'
          },
          onClick: (e) => e.stopPropagation()
        }, [
          when(ctx.getState('isLoaded'),
            element('div', [
              element('h2', [text('Heavy Content Loaded')]),
              element('p', [text('This content was loaded lazily.')])
            ]),
            element('div', [
              element('h2', [text('Loading...')]),
              element('p', [text('Please wait while content loads.')])
            ])
          ),
          
          element('button', {
            onClick: () => ctx.setState('isOpen', false)
          }, [text('Close')])
        ])
      ]), 'lazy-portal')
    )
  ]);
});
```

### Portal Memoization

```typescript
define('memoized-portal', (props, ctx) => {
  ctx.initState('isOpen', false);
  ctx.initState('data', null);
  
  // Prevent Portal re-rendering if data hasn't changed
  const memoizedPortalContent = () => {
    if (!ctx.getState('data')) {
      return null;
    }
    
    return portal(document.body, element('div', {
      className: 'memoized-portal',
      style: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: 'lightblue',
        padding: '10px',
        borderRadius: '4px'
      }
    }, [
      text(`Data: ${JSON.stringify(ctx.getState('data'))}`)
    ]), 'memoized-portal');
  };
  
  const loadData = () => {
    // Simulate data loading
    setTimeout(() => {
      ctx.setState('data', { timestamp: Date.now(), value: 'memoized data' });
    }, 500);
  };
  
  return element('div', [
    element('button', {
      onClick: () => {
        ctx.setState('isOpen', !ctx.getState('isOpen'));
        if (!ctx.getState('data')) {
          loadData();
        }
      }
    }, [text('Toggle Memoized Portal')]),
    
    when(ctx.getState('isOpen'),
      memoizedPortalContent()
    )
  ]);
});
```

## 9. Best Practices Summary

### Considerations When Using Portals

1. **Use unique IDs**: specify unique IDs when multiple Portals share the same target
2. **Preserve state**: preserve DOM state (focus, scroll, etc.) on Portal update
3. **Accessibility**: support keyboard navigation and screen readers
4. **Performance**: prevent unnecessary Portal rendering and use lazy loading
5. **Memory management**: clean up unused Portals
6. **Event handling**: handle event bubbling within Portal and external clicks

### Recommended Patterns

- **Conditional rendering**: use `when` to render Portal only when needed
- **State management**: link Portal state with component state
- **Event system**: use event bus for Portal-to-Portal communication
- **Accessibility**: support ARIA attributes and keyboard navigation
- **Performance**: reuse containers based on Portal ID

These patterns help you use the Portal system effectively.
