export default defineContentScript({
  matches: ['*://*.flipkart.com/*'],
  main() {
    console.log('⚡ Daam extension sensor active on this page!');
  },
});