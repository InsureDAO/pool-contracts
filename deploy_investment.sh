echo 'running build.sh'

npx hardhat clean

if [ -z "$NETWORK" ]; then
  echo "ERROR: NETWORK environment variable required"
  exit 1
fi

npx mustache scripts/deploy/config/$NETWORK.json scripts/deploy/templates/deploy_investment.template.mst > scripts/deploy/deploy_investment.js

echo 'generated deploy_investment.js'

npx hardhat run scripts/deploy/deploy_investment.js --network $NETWORK