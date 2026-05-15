from flask import Flask, jsonify
from sarimax_model import generate_forecast

app = Flask(__name__)

@app.route('/forecast', methods=['GET'])
def forecast():

    data = generate_forecast()

    return jsonify(data)

if __name__ == '__main__':
    app.run(port=5000, debug=True)