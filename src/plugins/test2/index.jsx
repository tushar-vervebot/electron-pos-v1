/**
 * test2/index.jsx
 *
 * Plugin entry point.
 * Only keep registration wiring here.
 * Put real business logic inside services/hooks/components and call it from here.
 */
export default async function register(api) {
  api.logger.info('Test2 plugin activated');

  // Way 1: Replace a component
  // api.registerComponent('cart.DiscountRow', MyDiscountRow);

  // Way 2: Inject into a slot
  // api.registerSlot('pos.cart.footer', {
  //   id: 'test2.cart-footer',
  //   component: MyCartFooter,
  //   order: 100,
  // });

  // Way 3: Wrap a component
  // api.wrapComponent('ProductCard', MyProductCardWrapper);

  // Way 4: Register a new screen/route
  // api.registerScreen('test2', {
  //   label: 'Test2',
  //   icon: 'PLG',
  //   component: MyTest2Screen,
  // });
}
