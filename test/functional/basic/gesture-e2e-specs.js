import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import wd from 'wd';
import _ from 'lodash';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { APPIUM_IMAGE } from '../web/helpers';
import xcode from 'appium-xcode';
import { util } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

const BTN_OK_CNCL = 'Okay / Cancel';

describe('XCUITestDriver - gestures', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  describe('dynamic gestures', function () {
    before(async function () {
      driver = await initSession(UICATALOG_CAPS);
    });
    beforeEach(async function () {
      await driver.back();
      await driver.execute('mobile: scroll', {direction: 'up'});
    });
    after(async function () {
      await deleteSession();
    });
    afterEach(async function () {
      // wait a moment to allow anything to happen
      await B.delay(500);
    });

    describe('tap, press, longpress', function () {
      beforeEach(async function () {
        await retryInterval(10, 500, async () => {
          await driver.elementByAccessibilityId('Alert Views').click();
          await retryInterval(5, 100, async function () {
            await driver.elementByAccessibilityId(BTN_OK_CNCL);
          });
        });
      });

      async function exitModal (name) {
        // should exist, will throw error if it doesn't
        let els = await driver.elementsByAccessibilityId(name);
        els.should.have.length(1);

        await retryInterval(5, 100, async () => {
          let els = await driver.elementsByAccessibilityId(name);
          if (els.length === 0) return; // eslint-disable-line curly
          await els[0].click();
        });
      }
      describe('tap', function () {
        it('should tap on the element', async function () {
          // TODO: this works locally but fails in CI.
          if (process.env.CI && UICATALOG_CAPS.platformVersion === '10.3') {
            return this.skip();
          }
          let el = await driver.elementByAccessibilityId(BTN_OK_CNCL);
          let action = new wd.TouchAction(driver);
          action.tap({el});
          await action.perform();

          await exitModal('OK');
        });
        it('should tap on arbitrary coordinates', async function () {
          let el = await driver.elementByAccessibilityId(BTN_OK_CNCL);
          let loc = await el.getLocation();
          let size = await el.getSize();

          loc = {
            x: loc.x + size.width / 2,
            y: loc.y + size.height / 2,
          };

          let action = new wd.TouchAction(driver);
          action.tap(loc);
          await action.perform();

          await exitModal('OK');
        });
      });
      it('should long press on an element', async function () {
        let el = await driver.elementByAccessibilityId(BTN_OK_CNCL);
        let action = new wd.TouchAction(driver);
        action.longPress({el}).release();
        await action.perform();

        await exitModal('Cancel');
      });
      it('should long press on an element with duration through press-wait-release', async function () {
        let el = await driver.elementByAccessibilityId(BTN_OK_CNCL);
        let action = new wd.TouchAction(driver);
        action.press({el}).wait(1200).release();
        await action.perform();

        await exitModal('Cancel');
      });
      it('should long press on an element with duration through pressOpts.duration', async function () {
        let el = await driver.elementByAccessibilityId(BTN_OK_CNCL);
        let action = new wd.TouchAction(driver);
        action.longPress({el, duration: 1200}).release();
        await action.perform();

        await exitModal('Cancel');
      });
      it('should long press on arbitrary coordinates', async function () {
        let el = await driver.elementByAccessibilityId(BTN_OK_CNCL);
        let loc = await el.getLocation();
        let size = await el.getSize();

        loc = {
          x: loc.x + size.width / 2,
          y: loc.y + size.height / 2,
        };

        let action = new wd.TouchAction(driver);
        action.press(loc).wait(500).release();
        await action.perform();

        await exitModal('OK');
      });
    });
    it('should scroll using touch actions', async function () {
      if (process.env.TRAVIS && util.compareVersions(UICATALOG_CAPS.platformVersion, '>=', '13.0')) {
        // TODO: figure out why this works locally but not on Travis
        return this.skip();
      }

      let el1 = await driver.elementByAccessibilityId('Activity Indicators');
      let el2 = await driver.elementByAccessibilityId('Progress Views');

      let el3 = await driver.elementByAccessibilityId('Web View');
      await el3.isDisplayed().should.eventually.be.false;

      let action = new wd.TouchAction(driver);
      action.press({el: el2}).wait(500).moveTo({el: el1}).release();
      await action.perform();

      await retryInterval(5, 1000, async function () {
        await el3.isDisplayed().should.eventually.be.true;
      });

      // go back
      await driver.execute('mobile: scroll', {direction: 'up'});
    });
    it('should double tap on an element', async function () {
      // FIXME: Multitouch does not work as expected in Xcode < 9.
      // cloud tests are run on Linux, so no Xcode version to check
      if (!process.env.CLOUD && (await xcode.getVersion(true)).major < 9) {
        return this.skip();
      }

      await driver.execute('mobile: scroll', {direction: 'down'});
      await driver.elementByAccessibilityId('Steppers').click();

      let stepper = await driver.elementByAccessibilityId('Increment');
      let action = new wd.TouchAction(driver);
      action.tap({el: stepper, count: 2});
      await action.perform();

      await driver.elementByAccessibilityId('2')
        .should.not.be.rejected;
    });
    it(`should swipe the table and the bottom cell's Y position should change accordingly`, async function () {
      let winEl = await driver.elementByClassName('XCUIElementTypeWindow');

      let pickerEl = await driver.elementByAccessibilityId('Picker View');
      let yInit = (await pickerEl.getLocation()).y;

      await driver.execute('mobile: swipe', {element: winEl, direction: 'up'}).should.not.be.rejected;
      let yMiddle = (await pickerEl.getLocation()).y;
      yMiddle.should.be.below(yInit);

      await driver.execute('mobile: swipe', {element: winEl, direction: 'down'}).should.not.be.rejected;
      let yFinal = (await pickerEl.getLocation()).y;
      yFinal.should.be.above(yMiddle);
    });
    describe('pinch and zoom', function () {
      beforeEach(async function () {
        await driver.execute('mobile: scroll', {direction: 'down'});
        await driver.elementByAccessibilityId('Web View').click();
      });

      // at this point this test relies on watching it happen, nothing is asserted
      // in automation, this just checks that errors aren't thrown
      it('should be able to pinch', async function () {
        let ctxs;
        await retryInterval(10, 1000, async () => {
          // on some systems (like Travis) it takes a while to load the webview
          ctxs = await driver.contexts();
          if (ctxs.length === 1) {
            throw new Error('No webview context found');
          }
        });
        await driver.context(ctxs[1]);

        await driver.get(APPIUM_IMAGE);

        await driver.context(ctxs[0]);

        async function doZoom () {
          let el = await driver.elementByClassName('XCUIElementTypeApplication');
          let thumb = new wd.TouchAction(driver);
          thumb.press({el, x: 100, y: 0}).moveTo({el, x: 50, y: 0}).release();

          let foreFinger = new wd.TouchAction(driver);
          foreFinger.press({el, x: 100, y: 0}).moveTo({el, x: 105, y: 0}).release();

          let zoom = new wd.MultiAction(driver);
          zoom.add(thumb, foreFinger);
          await zoom.perform();
        }
        await doZoom();

        async function doPinch () {
          let el = await driver.elementByClassName('XCUIElementTypeApplication');
          let thumb = new wd.TouchAction(driver);
          thumb.press({el, x: 50, y: 0}).moveTo({el, x: 100, y: 0}).release();

          let foreFinger = new wd.TouchAction(driver);
          foreFinger.press({el, x: 100, y: 0}).moveTo({el, x: 50, y: 0}).release();

          let pinch = new wd.MultiAction(driver);
          pinch.add(thumb, foreFinger);
          await pinch.perform();
        }
        await doPinch();
      });
    });
    describe('special actions', function () {
      it('should open the control center', async function () {
        let isStatusBarAvailable = false;
        try {
          await driver.elementByClassName('XCUIElementTypeStatusBar')
            .should.eventually.be.rejectedWith(/An element could not be located/);
        } catch (err) {
          // if this exists,
          isStatusBarAvailable = true;
          await driver.elementByAccessibilityId('ControlCenterView')
            .should.eventually.be.rejectedWith(/An element could not be located/);
        }

        let x, y0, y1;
        const window = await driver.elementByClassName('XCUIElementTypeApplication');
        const {width, height} = await window.getSize();
        try {
          // Try locating the 'Cellular' element (which can be pulled down)
          const cellularEl = await driver.elementByAccessibilityId('Cellular');
          const location = await cellularEl.getLocation();
          x = location.x;
          y0 = location.y;
        } catch (e) {
          // Otherwise, pull down the middle of the top of the Simulator
          x = width / 2;
          y0 = UICATALOG_CAPS.deviceName.toLowerCase().includes('iphone x')
            ? 15
            : height - 5;
        }
        y1 = height / 2;

        let action = new wd.TouchAction(driver);
        action.press({x, y: y0}).wait(500).moveTo({x, y: y1});
        await action.perform();

        // Control Center ought to be visible now
        if (isStatusBarAvailable) {
          await driver.elementByAccessibilityId('ControlCenterView');
        } else {
          await driver.elementByClassName('XCUIElementTypeStatusBar');
        }
      });
    });
  });
  describe('tap with tapWithShortPressDuration cap', function () {
    // needs a special cap, so has to be in its own session
    before(async function () {
      driver = await initSession(_.defaults({
        tapWithShortPressDuration: 0.01
      }, UICATALOG_CAPS));
    });
    after(async function () {
      await deleteSession();
    });

    it('should tap on the element', async function () {
      let el1 = await driver.elementByAccessibilityId('Alert Views');
      let action = new wd.TouchAction(driver);
      action.tap({el: el1});
      await action.perform();

      // pause a moment so the alert can animate
      await B.delay(500);

      let el2 = await driver.elementByAccessibilityId(BTN_OK_CNCL);
      el2.should.exist;
    });
  });
});
