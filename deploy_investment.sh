echo 'running build.sh'

npx hardhat clean

if [ -z "$NETWORK" ]; then
  echo "ERROR: NETWORK environment variable required"
  exit 1
fi

npx mustache scripts/config/$NETWORK.json scripts/deploy_investment.template.js > scripts/deploy_investment.js

echo 'generated deploy_investment.js'

npx hardhat run scripts/deploy_investment.js --network $NETWORK