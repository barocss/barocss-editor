/**
 * Type Safety Test for HTML Element Attributes
 * This file demonstrates the improved type safety for element attributes
 */

import { element } from '@barocss/dsl';

// Test type-safe element creation
function testTypeSafety() {
  // ✅ Button with correct attributes
  const button = element('button', {
    type: 'submit',        // ✅ Correct button type
    disabled: true,         // ✅ Correct boolean attribute
    onClick: (event: MouseEvent) => {   // ✅ Correct event handler type
      
    },
    className: 'btn-primary'
  }, ['Click me']);

  // ✅ Input with correct attributes
  const input = element('input', {
    type: 'email',          // ✅ Correct input type
    placeholder: 'Enter email',
    required: true,         // ✅ Correct boolean attribute
    minLength: 5,           // ✅ Correct number attribute
    onChange: (event: Event) => {  // ✅ Correct event handler type
      
    }
  });

  // ✅ Form with correct attributes
  const form = element('form', {
    action: '/submit',      // ✅ Correct form action
    method: 'post',         // ✅ Correct form method
    onSubmit: (event: Event) => {  // ✅ Correct event handler type
      event.preventDefault();
    }
  }, [input, button]);

  // ✅ Image with correct attributes
  const img = element('img', {
    src: '/image.jpg',      // ✅ Correct image source
    alt: 'Description',     // ✅ Correct alt text
    width: 300,             // ✅ Correct width
    height: 200,            // ✅ Correct height
    loading: 'lazy'         // ✅ Correct loading attribute
  });

  // ✅ Link with correct attributes
  const link = element('a', {
    href: 'https://example.com',  // ✅ Correct href
    target: '_blank',             // ✅ Correct target
    rel: 'noopener noreferrer'    // ✅ Correct rel attribute
  }, ['Visit Example']);

  // ✅ SVG with correct attributes
  const svg = element('svg', {
    viewBox: '0 0 100 100',       // ✅ Correct SVG viewBox
    width: 100,                   // ✅ Correct width
    height: 100,                  // ✅ Correct height
    fill: 'currentColor'          // ✅ Correct SVG fill
  }, [
    element('circle', {
      cx: 50,                     // ✅ Correct circle center x
      cy: 50,                     // ✅ Correct circle center y
      r: 40,                      // ✅ Correct circle radius
      stroke: 'black',            // ✅ Correct stroke color
      strokeWidth: 2              // ✅ Correct stroke width
    })
  ]);

  return { button, input, form, img, link, svg };
}

// Test type errors (these should cause TypeScript errors)
function testTypeErrors() {
  // ❌ These should cause TypeScript errors:
  
  // element('button', {
  //   type: 'invalid',        // ❌ Should error: invalid button type
  //   disabled: 'yes',        // ❌ Should error: boolean expected
  //   onClick: 'not a function' // ❌ Should error: function expected
  // });

  // element('input', {
  //   type: 'invalid',        // ❌ Should error: invalid input type
  //   minLength: 'five',     // ❌ Should error: number expected
  //   required: 'yes'        // ❌ Should error: boolean expected
  // });

  // element('form', {
  //   method: 'invalid'      // ❌ Should error: invalid form method
  // });

  // element('img', {
  //   loading: 'invalid'     // ❌ Should error: invalid loading value
  // });

  // element('a', {
  //   target: 'invalid'      // ❌ Should error: invalid target value
  // });
}

export { testTypeSafety, testTypeErrors };
